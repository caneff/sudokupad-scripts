# Color by Digit with six profiles (#237)

`MAX_PROFILES` went from 4 to 6. Checked 2026-11-06 on sudokupad.app in headless Chromium, script 0.6.0, with six
profiles saved (one named `My long profile name`), at 1280x800 and 375x667.

- **Profile menu** (`menu-desktop.png`, `menu-phone.png`): six rows plus Edit profiles… make a 326 px box that sits
  above the button and inside the viewport on both sizes. The long name wraps to two lines on the phone.
- **Dialog profile list** (`dialog-desktop.png`, `dialog-phone.png`): the list is 270 px tall at six rows (86 px at
  two) and the dialog scrolls, as it already did at two profiles (930 px of dialog in an 800 px viewport; 1435 px in
  667 px on the phone). Six rows are not crowded.

Not checked: a real touch device and a real Tampermonkey install.
