package store

import (
	"testing"

	"github.com/kestrel-tech/kyc/audit/crypto"
)

// link computes the chain hash for a row given the previous hash, mirroring the
// canonical pre-image used by both the DB trigger and verifyChain.
func link(prev string, r chainRow) string {
	return crypto.SHA256Hex(prev + r.SessionID + r.ClientID + r.EventType + r.Actor + r.Data)
}

// buildChain returns a well-formed chain: each row's Hash is derived from the
// running previous hash, exactly as the audit_events_chain trigger would.
func buildChain(rows []chainRow) []chainRow {
	prev := ""
	out := make([]chainRow, len(rows))
	for i, r := range rows {
		r.Hash = link(prev, r)
		out[i] = r
		prev = r.Hash
	}
	return out
}

func sampleRows() []chainRow {
	return []chainRow{
		{ID: 1, SessionID: "s1", ClientID: "c1", EventType: "SESSION_CREATED", Actor: "gateway", Data: `{"a":1}`},
		{ID: 2, SessionID: "s1", ClientID: "c1", EventType: "DOCUMENT_VERIFIED", Actor: "orchestrator", Data: `{"result":"clear"}`},
		{ID: 3, SessionID: "s1", ClientID: "", EventType: "PDPA_ERASURE", Actor: "system", Data: `null`},
	}
}

func TestVerifyChain_Empty(t *testing.T) {
	got := verifyChain(nil)
	if !got.Valid || got.Count != 0 || got.BrokenAt != 0 {
		t.Fatalf("empty chain: got %+v, want valid/count 0/broken 0", got)
	}
}

func TestVerifyChain_Intact(t *testing.T) {
	got := verifyChain(buildChain(sampleRows()))
	if !got.Valid {
		t.Fatalf("intact chain reported invalid at id %d", got.BrokenAt)
	}
	if got.Count != 3 {
		t.Fatalf("count = %d, want 3", got.Count)
	}
}

func TestVerifyChain_TamperedData(t *testing.T) {
	chain := buildChain(sampleRows())
	// Mutate the second row's payload without recomputing its hash.
	chain[1].Data = `{"result":"consider"}`

	got := verifyChain(chain)
	if got.Valid {
		t.Fatal("tampered chain reported valid")
	}
	if got.BrokenAt != 2 {
		t.Fatalf("brokenAt = %d, want 2 (first mismatched row)", got.BrokenAt)
	}
}

func TestVerifyChain_TamperedActor(t *testing.T) {
	chain := buildChain(sampleRows())
	// Altering the actor alone must break the chain now that actor is hashed.
	chain[0].Actor = "attacker"

	got := verifyChain(chain)
	if got.Valid {
		t.Fatal("actor tamper not detected")
	}
	if got.BrokenAt != 1 {
		t.Fatalf("brokenAt = %d, want 1", got.BrokenAt)
	}
}

func TestVerifyChain_ReorderBreaks(t *testing.T) {
	chain := buildChain(sampleRows())
	// Swapping two rows breaks the running-prev linkage.
	chain[1], chain[2] = chain[2], chain[1]

	if verifyChain(chain).Valid {
		t.Fatal("reordered chain reported valid")
	}
}
