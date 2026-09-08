import Std

-- A core-only, bounded-divisor definition used just for this audit demonstration.
def Prime (p : Nat) : Prop :=
  2 ≤ p ∧ ∀ d : Fin p, d.val ∣ p → d.val = 1

def Requested : Prop :=
  ∀ n : Nat, ∃ p : Nat, n < p ∧ Prime p ∧ p % 4 = 3

-- Kernel-checked, but only proves the existence of one such prime.
theorem weakened : ∃ p : Nat, Prime p ∧ p % 4 = 3 := by
  exact ⟨3, by unfold Prime; decide, by decide⟩

-- Also kernel-checked: the requested theorem is now an extra assumption.
theorem circular_specification (already_proved : Requested) : Requested :=
  already_proved

#print axioms weakened
#print axioms circular_specification
#check weakened
#check circular_specification

-- The fixed-type audit refuses either as a proof of Requested.
-- Uncommenting either line must produce a type mismatch.
-- example : Requested := weakened
-- example : Requested := circular_specification
