# Live tests type storage keys out

Status: accepted, 2026-11-04 (audit sweep run-20261104-144940)

A live test that reads or plants a saved setting spells its key out, as in
`const THICKNESS_KEY = 'PenColor_thickness'`, instead of importing the key
from the script. A rename of a saved key drops every installed user's saved
choice, and a test that types the old key fails on that rename. A test that
imports the key renames with it and stays green, so it cannot catch the loss.

DOM ids and other values that carry no saved state (`STYLE_ID`,
`MARKS_LAYER_ID`) may still be imported from the script.
