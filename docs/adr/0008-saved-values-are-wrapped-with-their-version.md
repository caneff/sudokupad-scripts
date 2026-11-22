# Saved values are wrapped with their version, and unreadable copies are kept

Status: accepted, 2026-11-07 (#487: "i want all 10 suggestions" on the reliability review (Chris, 2026-11-07))

A script's saved value is stored as `{ v, data }` (`lib/store.js`). A later change to a value's shape has a version to migrate from. A
value saved before the wrapper, which is every shape saved so far, reads as version 0. A version above the script's own, as after a
downgrade, is unreadable.

Reading goes through the guard's store (ADR 0006), with one reader per key used for both loading and pasting settings. A value its
reader refuses is an **unreadable value**: the script goes on with its defaults, and the value as it was is copied under the same
key with `_unreadable` added (`_unreadable2` and on for a second, never replacing a kept copy) before anything can save over it. A
copy the browser refuses to store stops saving instead of being forgotten.

Why: #487 found that if Color by Digit could not read its saved profiles (after a downgrade, say), it showed the presets and the next
save threw the solver's profiles away. Loading and pasting also disagreed on what a value is (Auto Rules Resizer accepted a stored
`'300'` and refused the same value pasted). A save of defaults over data nobody could read is the loss this prevents; a kept copy
costs a few bytes under a name the script never reads.

Key names are saved data too: a rename without a copy-forward drops every installed solver's setting (ADR 0001).
