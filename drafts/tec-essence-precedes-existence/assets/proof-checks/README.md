# Reproducible TEC proof-audit checks

Executed 2026-09-08 with Lean 4.25.0, commit `cdd38ac5115bdeec5f609e9126cce00f51ae88b3`, on arm64 macOS. These files import only `Std`; no Mathlib dependency is needed.

The local `Prime` definition uses bounded trial divisors: `2 ≤ p` and every natural divisor below `p` equals 1. It is a core-only version of the ordinary prime predicate, introduced for this small audit demonstration. These files do not purport to execute the full Mathlib infinitude proof.

Run:

```sh
lean PrimeAudit.lean
lean RejectedTarget.lean
lean Composition.lean
```

Expected results:

- `PrimeAudit.lean`: exit 0. The weaker statement and the statement with the original goal added as an assumption both compile. Their axiom closures are `[propext]` and `[]`.
- `RejectedTarget.lean`: exit 1, intentionally. The same declarations are rejected when submitted as proofs of the preserved full target.
- `Composition.lean`: exit 0. For S={3,7}, 4 product(S)+1 is 85=5×17. It is divisible by neither member of S, but the factors are both 1 modulo 4. The intended subtraction construction 83 satisfies the size, residue and nondivisibility interface.

[executed-checks.txt](executed-checks.txt) is the captured output of these actual runs. A successful local theorem check establishes the theorem that was supplied. It does not establish that its statement matches a different requested task.
