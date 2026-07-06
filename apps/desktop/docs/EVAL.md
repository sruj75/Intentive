# Desktop Eval

Desktop privacy and reliability evals are grouped around three guarantees:

| Guarantee | Meaning | Current Status |
| --- | --- | --- |
| Local boundary | Raw frames, recordings, and audio stay on the Mac by default | Covered by `PerceptionPublisher` raw-byte rejection tests |
| Contract drift | Swift Protocol codables match `packages/protocol` JSON fixtures | Covered by Swift tests that decode shared fixtures |
| Privacy efficacy | Redaction and secret detection suppress sensitive screen content before egress | Covered for deterministic secret-like strings; broaden with fixture corpus before release |

The Runtime receives compact `perception_event` records, not raw capture material.
