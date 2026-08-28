// backend/internal/session/store_test.go
package session

import (
	"testing"
	"time"
)

func TestStore_CreateAndGet(t *testing.T) {
	store := NewStore(30 * time.Minute)
	sess := store.Create()
	if sess.ID == "" {
		t.Fatal("expected non-empty session ID")
	}
	got, ok := store.Get(sess.ID)
	if !ok {
		t.Fatal("expected session to be found")
	}
	if got.ID != sess.ID {
		t.Errorf("expected ID %q, got %q", sess.ID, got.ID)
	}
}

func TestStore_GetMissing(t *testing.T) {
	store := NewStore(30 * time.Minute)
	if _, ok := store.Get("does-not-exist"); ok {
		t.Fatal("expected session not to be found")
	}
}

func TestStore_Delete(t *testing.T) {
	store := NewStore(30 * time.Minute)
	sess := store.Create()
	store.Delete(sess.ID)
	if _, ok := store.Get(sess.ID); ok {
		t.Fatal("expected session to be deleted")
	}
}

func TestStore_RemoveExpired(t *testing.T) {
	store := NewStore(10 * time.Minute)
	sess := store.Create()
	sess.LastAccess = time.Now().Add(-20 * time.Minute)

	removed := store.RemoveExpired(time.Now())
	if removed != 1 {
		t.Fatalf("expected 1 session removed, got %d", removed)
	}
	if _, ok := store.Get(sess.ID); ok {
		t.Fatal("expected expired session to be gone")
	}
}

func TestStore_RemoveExpired_KeepsFresh(t *testing.T) {
	store := NewStore(10 * time.Minute)
	sess := store.Create()

	removed := store.RemoveExpired(time.Now())
	if removed != 0 {
		t.Fatalf("expected 0 sessions removed, got %d", removed)
	}
	if _, ok := store.Get(sess.ID); !ok {
		t.Fatal("expected fresh session to remain")
	}
}
