import Std

def Prime (p : Nat) : Prop :=
  2 ≤ p ∧ ∀ d : Fin p, d.val ∣ p → d.val = 1

-- Construction borrowed from the ordinary Euclid proof, for S = {3, 7}.
theorem plus_one_is_fresh : ¬3 ∣ (4 * (3 * 7) + 1) ∧ ¬7 ∣ (4 * (3 * 7) + 1) := by
  decide

-- It does not satisfy the residue precondition of the factor lemma.
theorem missing_residue_condition : (4 * (3 * 7) + 1) % 4 ≠ 3 := by
  decide

-- Both of its prime factors are 1 modulo 4.
theorem bad_candidate_factorization : (4 * (3 * 7) + 1) = 5 * 17 := by decide
theorem bad_candidate_factors : Prime 5 ∧ Prime 17 ∧ 5 % 4 = 1 ∧ 17 % 4 = 1 := by
  unfold Prime
  decide

-- The intended construction satisfies the required interface instead.
theorem minus_one_interface :
    (4 * (3 * 7) - 1) > 1 ∧
    (4 * (3 * 7) - 1) % 4 = 3 ∧
    ¬3 ∣ (4 * (3 * 7) - 1) ∧ ¬7 ∣ (4 * (3 * 7) - 1) := by
  decide

#print axioms plus_one_is_fresh
#print axioms bad_candidate_factors
#print axioms minus_one_interface
