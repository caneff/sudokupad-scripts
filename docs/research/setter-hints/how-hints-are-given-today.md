# How setters give hints today, and the progressive-hint formats that exist (#1169)

Read on 2026-11-23 for the setter-hints map (#1167). The question: how do puzzle setters hand out hints today, and which
progressive-hint formats and systems exist? For each one: who writes the hint, how it is hidden, how it is revealed, **how the
person reaches the hint that fits where they are stuck** (the map's open decision), whether the hint is text or shows something
on the grid, and what users say is missing.

Method: web searches (listed under § Searches run) read as search extracts; a few pages fetched whole; SudokuPad 0.616.0's own
source read from the live tests' recording (`~/.cache/sudokupad-scripts/live/sudokupad.har`); two open-source hunt servers read
through `gh api`. Two requests went to logic-masters.de (one puzzle page fetched as text, one as raw HTML); everything else from
that site came from search-engine extracts. Nothing was installed or run. "Not found" below means not found in the searches
listed, never "none exists".

## Summary

| System | Who writes | Hidden by | Revealed by | How the right hint is reached | Text or grid |
|---|---|---|---|---|---|
| Logic Masters, hints in the description | Setter | Text colored like its background, tiny font, ROT13 | Selecting the text, copying it out, decoding | A numbered list read top down; the solver stops when one helps | Text; sometimes a link to a second puzzle with a marked or filled grid |
| Logic Masters, hidden comments | Anyone, setter included | Shown only to people who solved | Solving | Not reachable while stuck | Text |
| Logic Masters forum, private messages | Setter or another solver | Private | Asking | A human reads where the solver is | Text |
| CTC Discord (GAS) | Setter | Discord spoiler tags, separate docs | Clicking the tag, opening the doc | A short numbered list with stated escalation; the solver reads in order | Text |
| CTC apps | Setter, or Simon and Mark | Behind a hint button | Pressing for the next hint | A fixed sequence along the setter's path; it assumes the solver is at that point | Text (covers the board) |
| CTC Steam app "Smart Hint" | Software | Button | Pressing | Reads the grid | Shows cells; not setter-written |
| SudokuPad | Setter | Puzzle data | Solve check (`msgcorrect`, `msgincorrect`, partial); fog lifts when a trigger cell is right | Grid state, but only at the end or per cell, and no hint field | Text message; fog reveals clues on the grid |
| f-puzzles, Penpa+ | Setter | Puzzle data | Solve check | End of solve only | Text message |
| Puzzle hunts, human-answered with canned text | Author writes canned hints; staff choose | Staff-only list | A staff reply | The team writes what they have; a human picks the matching canned hint | Text |
| Puzzle hunts, self-serve canned | Author | Locked buttons, timers, hint currency | Spending a hint, waiting, or entering a partial answer | Fixed order; some label hints by topic; ClueKeeper unlocks hints when a partial answer is entered | Text |
| UHS, Invisiclues, staged game guides | Hint author | Encrypted file, invisible ink, collapsed text | Revealing one line at a time | The player picks a **question** from a list (a menu tree in UHS), then reads that question's hints in order | Text; UHS can reveal images in stages |
| EXIT and Unlock! (tabletop escape games) | Designer | Cards face down; app | Turning a card; typing a card number in the app | The player picks the puzzle by a symbol or card number, then takes 1st clue, 2nd clue, solution | Text |
| Escape-room hint software | Designer writes ordered clues; game master sends them | Game master console | Game master pushes one | A human watches the room; some tools show which step a team is on from sensors | Text, image, audio, video |
| Cryptic-crossword hint apps | Setter or app | Hint button | Pressing | The player picks the clue, then a fixed ladder (definition, clue type, parts, answer) | Text; some highlight the clue words |

## 1. Logic Masters Germany

**Hints written into the description, hidden in the page.** Setters put numbered hints in the puzzle text and hide them by
styling, with an instruction to reveal them.

- PhoenixAki, "Sorry, That Sum Is Taken", 2025-12-29 (hints added 2026-01-14),
  https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000QR8: "To increase accessibility to my puzzles, I include hints
  in my LMD posts". Five hints, Hint 1 to Hint 5, from the break-in to "the final disambiguation step". Read in the raw HTML: each
  is `<span style="user-select: all;background: currentColor;color: #aaa;">`, so the text sits on a block of its own color until
  selected. The setter's comment: "Added hints after learning recently how to do that in HTML." Same five-hint pattern in
  "Escape the Foggy Liar", 2025-01-15 (hints added 2026-01-12), https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000LLB.
- Samish, "Jaguar's Paw (irregular 6x6)", 2022-07-23, https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000AJR: "I've
  included hints and explanations of my path in white text below the image. Highlight it to read !" Three rounds, each a Hint
  then a Step that states the deduction ("Hint 1 ... Step 1 ... Hint 2 ... Step 2 ...").
- Phistomefel, "Equal Snake Pit", 2020-10-04, https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=en&id=0004E3: one
  hint for the entry, "just mark the lines below, which contain a hint", and the hint includes a Penpa+ link "with an underlaid
  checkerboard pattern", so the hint shows something on the grid through a second puzzle link.
- Richard, "Double Dutch Sudoku Advent (9)", 2014-12-09, https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=en&id=00024J
  (fetched): "we have written some solving hints for most of the puzzles, published in a very tiny font. If you want to read the
  hints, simply copy these in a text editor and enlarge the font size." One paragraph, not staged.
- A commenter on Richard's "(Extra)ordinary Arrow Sudoku" (jwmpuz, 2021-05-02,
  https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=en&id=00064Q): "I've seen some puzzle sites put hints in ROT13
  to avoid unintended spoilers."

How the right hint is reached: the hints are a numbered list in solving order; the solver reveals from the top and stops when one
helps. Nothing ties a hint to the grid; the wording names the region ("box 6", "R1C9") so a solver can skip a hint about a part
they have done, but only after revealing it.

**Hidden comments.** The portal has a comment type "that can only be read by users who have solved the puzzle, and the author"
(Hilfe, "Understanding the puzzle page", https://logic-masters.de/Raetselportal/Hilfe/loesen.php?chlang=en, undated). Setters use
it for post-solve explanations, not hints: Richard on 00064Q, 2021-05-01: "For those of you who guessed, the nicest logic is written
in a hidden comment now", and to jwmpuz: "yes, the hidden comments are visible only after solving. If you want a hint beforehand:
send me a PM in the forum." jessica6 on the forum, 2025-09-01 ("Replying to comments on your puzzle",
https://forum.logic-masters.de/showthread.php?tid=2267): "if you make an own hidden comment ... the addressee can't read it unless
he/she has solved the puzzle." So a hidden comment cannot reach a stuck solver.

**Convention: no hints in public comments; ask by private message.** The thread "Lösungshinweise im Rätselportal" (2009,
https://forum.logic-masters.de/showthread.php?tid=371 and pages 2 and 3) set the norm. Moderators trim spoiling comments and mark the cut
"(...)" (Claudia, 2009-06-26), and the comment form carries a bold warning against solving hints (Berni, same page). The help pages
point stuck solvers to the list of solvers, the author and private messages in the forum (Hilfe, "Rundgang",
https://logic-masters.de/Raetselportal/Hilfe/rundgang.php?chlang=de).

What users say is missing:

- SabineH, 2009-04-09 (page 2): "Ich kann aber gut verstehen, dass man manchmal einfach nur einen kleinen Tipp bräuchte und dann
  nicht weiß, wie man wen erreicht, der einem weiterhilft." (Sometimes you just need a small tip and don't know how to reach
  someone who will help.) She proposed cipher text or "Text der die Hintergrundfarbe hat und nur durch Markierung mit der Maus
  sichtbar wird = Spoiler", the convention setters use today.
- Susie, 2009 (page 1): "Nur, wie soll man jemandem helfen oder um Hilfe bitten, wenn es nirgendwo erlaubt ist? ... Wo fragt man?"
  (How do you help or ask for help when it is allowed nowhere? Where do you ask?)
- Calavera, 2009-06-26 (page 3): "oft diejenigen, die es noch nicht gelöst haben, unwissentlich die größten Tipps geben" (those who
  have not solved it often give the biggest tips without knowing).
- Lucx on "Equal Snake Pit", 2020-12-15: "Ich würde den Hinweis ... weglassen" (I would leave the hint out); pointing out that an
  entry argument is needed was enough.

Prior note: Logic Masters' board asked a userscript author to take an install link down (2025-02-21), recorded in
`docs/research/other-sudokupad-userscripts.md` § Userscripts for Logic Masters and Penpa+.

## 2. Cracking the Cryptic

**The apps.** "The apps provide handwritten hints, pointing players who are stuck in the right direction without giving away
digits" (CTC Apps, Cracking the Cryptic fandom wiki, https://crackingthecryptic.fandom.com/wiki/CTC_Apps, undated). The Steam app
says "Mark and Simon have written hints for the challenging puzzles themselves" (Cracking the Cryptic on Steam,
https://store.steampowered.com/app/2085970/Cracking_the_Cryptic/); a reviewer says the puzzles "come with hints by their creators,
which sometimes step-by-step you through the puzzle, sometimes just are vague guidelines" (Steam review, 2023-01-07, via
https://steammaho.com/app/2085970, a mirror of Steam reviews). Hints are numbered per puzzle: players cite "Fog #15 - Hint #11"
(Ranzer, 2025-05-29, "So many wrong hints!", https://steamcommunity.com/app/2085970/discussions/0/640179350026594141/) and "Fog #33 ...
hint #14" (community hub, https://steamcommunity.com/app/2085970). The notation is the setters' r/c shorthand, explained by Mark in
"Tips and Tricks by Mark" (NickCarney94, 2019-08-19, https://steamcommunity.com/app/1117310/discussions/0/3647273545692942058/).
The Steam app adds a separate "Smart Hint" that reads the grid ("it will find you naked and hidden singles ... And it will tell you
if you have digits wrong", Steam review 2023-01-07, same mirror); it is software, not setter-written.

How the right hint is reached: by pressing for the next hint in a fixed sequence that follows the setter's solve path. The app does
not match a hint to the solver's grid (not read first-hand: the app was not run; this rests on the reviews below).

What users say is missing:

- Ryanjm33, App Store, 2020-08-20 (via https://www.iofreeonline.com/IOS/game/Classic-Sudoku.html, a mirror of App Store reviews):
  "They don't even just highlight on the board, instead they cover it up so you have to remember what it says OR keep flipping
  between the board and the hint. And often times the hint assumes you were able to get to a certain point in the puzzle, so it
  might not even help. Other apps can give you a hint based on the current position in the solution where you are at."
- emattbranch, App Store, 2023-01-20 (Cracking the Cryptic reviews, https://apps.apple.com/us/app/cracking-the-cryptic/id1629992934?platform=ipad&see-all=reviews):
  "So many times I read a hint that does not apply to the puzzle at all ... And at the point I'm at it simply doesn't reveal
  anything".
- A Steam reviewer, 2025-10-01 (steammaho mirror): "half a hint points me to what I need to focus on ... Some clues state a fact
  with no explanation of how they came to it ... Show your work!!!"
- Typos and wrong hints, repeatedly: "So many wrong hints!" thread above (2025-03-12 to 2025-12-11); "clues 2 and 3 are flat out
  incorrect" (Stick figure specialist, App Store, 2024-05-07, same App Store page).
- Vendavalez, App Store, 2022-09-18 (Classic Sudoku!, https://apps.apple.com/us/app/classic-sudoku/id1488838275): wants to replay a
  finished solve "to compare against the hints".

**The community (Discord).** The CTC Discord itself was not read (it needs an account). Its daily "Genuinely Approachable Sudoku"
posts are archived as monthly PDFs, the GAS Leaks, which reproduce the spoilered text on a "Hints and other spoilered texts" page:

- Philip Newman, "A Short Cut to...", GAS Leak 47, 2024-12-07, https://sudokutheory.com/gas/leaks/GAS_Leak_47_-_December_2024.pdf:
  four numbered hints (1️⃣ to 4️⃣) with the escalation stated up front: "The next hint is the type of thing you might need to look
  for with the variant, and the third is more explicit about where to look, spoilers for those who want to choose their own
  adventure."
- Philip Newman, "Revenge of the Vault", GAS Leak 48, 2025-01-22, https://sudokutheory.com/gas/leaks/GAS_Leak_48_-_January_2025.pdf:
  a "Choose Your Own Difficulty" puzzle: one GAS 101 hint "pointing to where you should look", and a second SudokuPad link "with
  those key cells filled with given digits". The grid-level hint is a second puzzle.
- "GAS 101" documents: a setter's explainer of the technique, linked as a Google Doc (GAS Leak 8, 2021-11-03,
  https://sudokutheory.com/gas/leaks/GAS_Leak_08_-_October_25_2021_-_November_13_2021.pdf; "feel free to use as much or as little
  of the document as you like", GAS Leak 26, 2023-03-30, https://sudokutheory.com/gas/leaks/GAS_Leak_26_-_March_2023.pdf).
- Spoiler tags are Discord's `||text||` (`docs/research/text-anywhere/discord-markdown.md`); GAS Leak 52 (May 2025,
  https://sudokutheory.com/gas/leaks/GAS_Leak_52_-_May_2025.pdf) asks for a guess "||in spoiler tags||".

How the right hint is reached: a short numbered list, read in order, sometimes with each hint's scope announced; a solver stuck
later can skip ahead only by reading. Steam's own spoiler tags failed on embedded widgets: "apparently, widgets don't respect
spoiler tags" (Maul, 2025-05-01, community hub above).

## 3. SudokuPad, SudokuMaker, f-puzzles and Penpa+

**SudokuPad** (0.616.0's source in the recording):

- No hint field. The puzzle metadata tags are `title`, `author`, `rules`, `solution`, `msgcorrect`, `msgincorrect`, `msgvalid`,
  `msginvalid`, `msgunknown` (`metaTagsWithoutCells` in `puzpatcher.bundle.js`).
- Setter messages on the solve check: `getDialogParts` in `script.js` replaces the default text of the "correct", "partial"
  ("Looking good so far! ... The digits you entered are correct"), "incorrect", "valid" and other dialogs with `msg<type>` from the
  puzzle when present. So a setter can word what a check says, but the message is one per outcome, not per step.
- Gifting (`feature-gifting.js`): a gift link adds a message to the rules and a "Solved Message" (`msgcorrect`), each at most 200
  characters (`C.MaxMessageLength`).
- Fog (`feature-fog.js`): a correct digit in a lamp cell lights the cells around it, and `triggereffect` entries of type
  `foglight` light chosen cells when a chosen trigger cell is correct (`foglink` in `getLitCells`). This is the one setter-staged
  reveal keyed to the solver's grid in SudokuPad, and it reveals clues on the grid, not text. PhoenixAki's fog puzzle above notes
  "the way fog gets cleared ... reflecting updates to SudokuMaker".
- The "AI Assistant" (`feature-aiassistant.js`) is an April Fools' feature ("This is an exclusive preview, only available TODAY,
  April First"); its "hints" are jokes and a random guess.

**SudokuMaker**: no hint or message field found in the searches below; its user guide by kammer
(https://kammer.xyz/blog/sudokumaker/, undated, "as of Spring 2026") covers custom constraints only. SudokuMaker was not opened.

**f-puzzles**: the "Fpuzzles-Solution" userscript by Rangsk and Charlie
(https://gist.github.com/dclamage/63cc6241752dbeb1214328f4ae655cf7, created 2021-10-19) adds a solution and "a custom message for a
correct solve", stored as a `msgcorrect:` cage that SudokuPad reads; f-puzzles' "Fog Support" userscript places fog lights
(listed in the SudokuSolver wiki, https://github-wiki-see.page/m/dclamage/SudokuSolver/wiki/fpuzzles-integration).

**Penpa+**: "Custom Message: Default answer validation message is 'Congratulations'. User can provide a custom congratulatory
message" (README, https://github.com/swaroopg92/penpa-edit; "Custom answer check message" in CHANGELOG 2.26.17, 2022-03-08). A
search of the Penpa+ and SudokuPad issue trackers for "hint" found no hint request (see § Searches run).

So every editor lets a setter write a message for the end of the solve; none found has a field for hints during it.

## 4. Setter-written hint systems elsewhere

**Puzzle hunts.**

- gph-site (Galactic Puzzle Hunt, https://github.com/galacticpuzzlehunt/gph-site, last commit 2024-09-12): read through `gh api`.
  The `Hint` model is a team's free-text `hint_question` and a staff `response`; there is no canned-hint model. The answering page
  shows "previous hints" for the same team and for all teams on that puzzle with a "Copy response" link (`hint.html`). Alex Irpan,
  commenting on Puzzlvaria (2025-01-05,
  https://puzzlvaria.wordpress.com/2025/01/05/unlockers-remorse-the-risks-and-rewards-of-choice-as-a-puzzlehunt-mechanism/):
  "Often the author has written canned hints for what to tell solvers based on their solve progress, and hint repliers just
  copy-paste that in the reply after they figure out what the team knows ... the canned hints and their labels are all hidden,
  except to hunt staff."
- spoilr (MIT Mystery Hunt 2022, Palindrome, https://github.com/Palindrome-Puzzles/2022-hunt): a staff page of canned hints with
  columns Order, Keywords, Content and Copy (`spoilr/hints/templates/spoilr/hints/canned.tmpl`); "view canned hints we'd
  pre-written before the hunt" (`docs/features.md`). Puzzle authors add "pre-written hints that hint-givers can edit" as a step
  before a puzzle is done (CJ Q., "Two hundred puzzles, fifty weeks later", MIT Admissions, 2021-02-06,
  https://mitadmissions.org/blogs/entry/two-hundred-puzzles-2/).
- PuzzleSpring (successor of Puzzlehunt CMU's puzzlehunt_server, docs https://www.puzzlespring.com/docs/creating-hunts/hints.html):
  a `CannedHint` has only `order` and `text`; "Automatically revealed in order", with policies "Canned First", "Canned Only" or
  "Mixed". puzzlehunt_server itself only had custom hints and hint unlock plans by time or solves
  (https://puzzlehunt-server.readthedocs.io/en/latest/hunt_creation.html).
- DASH on ClueKeeper (DASH 12 Player's Guide, https://playdash.org/DASH12/PlayerGuide.pdf): hints per puzzle in a list, each
  LOCKED, timed, or FREE; taking one early costs the time left. "Sometimes submitting a partial solution will unlock hints". Tip:
  "have just one person read each hint and judge how much to share."
- Bpuzzled releases canned hints automatically every 10 minutes, up to six (Puzzles Wiki, https://www.puzzles.wiki/wiki/Bpuzzled).
- Puzzles Wiki, "Canned Hints" (https://www.puzzles.wiki/wiki/Canned_Hints): Puzzle Boat divides hints "by the helpfulness of the
  hint (such as PB's Bronze/Silver/Gold hints) or by the part of the puzzle that is being hinted"; Verwald's Treasures took hint
  requests through the answer box ("submit the word APPRENTICE, and be given options for further submissions to get hints on
  specific areas of a puzzle").

What hunt writers say is missing:

- Dan Katz, Puzzlvaria, 2025-01-05 (above): a canned hint "will be extremely useful if you're stuck on the aspect of a puzzle the
  constructors expected, and useless if it doesn't address the problem your team is having. The Microsoft Puzzle Hunt has used a
  hint system where the canned hints are labeled with what they address, but it's very hard to do this without spoiling the
  structure of the puzzle."
- fortenforge, "suggestions-for-running-a-puzzlehunt" (https://github.com/fortenforge/suggestions-for-running-a-puzzlehunt): "the
  hint will often help with a part of the puzzle that a team has already figured out. It might be useful to generate multiple
  canned hints per puzzle and annotate them with the rough stage of the puzzle it corresponds to."
- Puzzles Wiki, "Canned Hints": with timed hints, "earlier hints tend to ... hint at earlier steps of a puzzle ... which can make
  teams stuck on a different part of the puzzle frustrated", which ClueKeeper mitigates with partial answers.

**Universal Hint System (UHS).** Created by Jason Strautman in 1988; "the UHS lets you select questions and view only as much
information as you want -- from subtle nudges to full answers" and supports "graphics that progressively reveal themselves in a
hint-like fashion" (About, https://www.uhs-hints.com/about/). Format (Stefan Wolff's notes, https://www.swolff.dk/uhs/): a tree of
subjects and links whose leaves are `hint` hunks, each a question label and its hints separated by `-` lines, encrypted, with a CRC
"to prevent third parties from tampering"; `nesthint` hunks nest links inside a hint. Open reader: OpenUHS
(https://github.com/Vhati/OpenUHS). The publisher's authoring page (https://www.uhs-hints.com/about/authoring.php): "UHS files are
designed to be read in any order. A good UHS file will be written so that it makes sense no matter how it's read ... we've seen a
lot of files that don't ... the answers you need won't be where you expect them". Who writes: hint authors, edited by the
publisher, not the game's designer. Reached by browsing the question tree to the question that matches.

**Invisiclues.** Infocom's hint books: questions in plain ink, answers in invisible ink revealed with a marker, "increasingly
specific answers" per question (IFWiki, https://www.ifwiki.org/Invisiclues); "a certain number of misleading fake questions" kept
the question list from spoiling (Infocom, Wikipedia, https://en.wikipedia.org/wiki/Infocom). Written by the publisher. Reached by
the player finding the question that matches. The Solid Gold re-releases put them in game ("typing HINT twice", same page).

**Staged game guides.** Baron, "Spoiler-Safe Outer Wilds FAQ", Steam guide
(https://steamcommunity.com/sharedfiles/filedetails/?id=2160452487): questions grouped by place, each answered "Your first hint
... Your second hint ... Your answer", hidden with spoiler markup; written by a player, not the designer. A player wished the game
itself "could have had a hintbook-style tiered hint system for each node" (Outer Wilds discussion,
https://steamcommunity.com/app/753640/discussions/0/2568689796949024350/?ctp=2).

**Tabletop escape games.** EXIT: three Help Cards per riddle, sorted by the riddle's symbol: "1st CLUE" (also lists which cards
you need), "2nd CLUE", "SOLUTION" (rules, https://www.ultraboardgames.com/exit-the-game/game-rules.php). Room Escape Artist
(David Spira, 2017-07-06,
https://roomescapeartist.com/2017/07/06/exit-the-game-the-abandoned-cabin-the-secret-lab-the-pharaohs-tomb-review/): "If you find
yourself using a hint to confirm that you have all of the components, cover the bottom half of the first hint card". Unlock!: the
app's Hint button takes "the number of the revealed card that you need assistance with"; "for some cards, the app will offer you a
second hint ... and possibly the solution", and a "Hidden Object" button "indicates the closest hidden object based on your
progress" (Unlock! rules, https://cdn.1j1ju.com/medias/89/19/d7-unlock-rules.pdf; Star Wars rules,
https://cdn.1j1ju.com/medias/e6/96/7f-unlock-star-wars-rulebook.pdf). Reached by naming the puzzle (symbol or card number),
then in order.

**Escape-room software.** The designer writes clues per puzzle, "in order, from a light nudge to direct help" (Escape Director,
https://docs.escapedirector.com/build-your-rooms/add-puzzles-and-clues); a game master sends them. Escape Game System's
open-source console shows "what each puzzle step waits for, which hints were given, and where a typical team would be by now",
from the room's sensors and "the median times of earlier games" (https://www.escpe.net/en/projects/gamemaster-interface/). ClueMaster can send clues "based on time elapsed when
clues remain unsolved" or on a button press (https://www.cluemaster.io/features/features). Reached by a human watching, helped
by the room's own state.

**Cryptic-crossword hint ladders.** The ladder is fixed by clue type, not written per step: Daily Cryptic gives "up to four hints
... where the definition is, what kind of wordplay is at work, and how the parts fit together", and "each clue carries the name
of the setter" (https://dailygamestoplay.com/games/daily-cryptic-solve-and-learn); Cryptic Inkling: "Hint 1 · the definition, Hint
2 · the clue type, Hint 3 · the pieces, Hint 4 · the build, The answer · only if you ask", drafted by AI
(https://crypticinkling.co.uk/waitlist). Reached by picking the clue, the crossword's own unit.

## 5. Setter-written hints for variant sudoku specifically

Not found in these searches: a format, file or tool for setter-written hints on variant sudoku, on GitHub or Greasy Fork. What
was found is solver-made: SudokuPad Tools' HINT button (https://greasyfork.org/en/scripts/566830-sudokupad-tools, classic 9x9 only),
Sven Magic, `pencilmark` and variantsudoku.com (all in `docs/research/other-sudokupad-userscripts.md`), and GitHub repos named
"sudoku hint" that from their names and descriptions are hint engines. Setters' own hints live as prose: numbered lists in
Logic Masters descriptions, spoilered Discord posts, Google Docs, and the CTC apps' private data.

## Patterns that recur

- **A numbered ladder from vague to specific.** Every setter-written system uses one: PhoenixAki's five, Samish's hint then step,
  GAS's numbered spoilers, the CTC apps, EXIT's three cards, UHS, Invisiclues, cryptic apps' four levels. The last rung is often
  the answer or the deduction itself.
- **Two axes, not one.** Mature systems separate *which question* (the step or place) from *how much* (the rung): UHS and
  Invisiclues by question, EXIT by symbol, Unlock! by card number, crossword apps by clue, Outer Wilds guides by place, Puzzle Boat
  by "the part of the puzzle". Sudoku setters' hints mostly have one axis, a single sequence that mixes step and depth.
- **Hidden by the medium, not by the format.** Same-color text, tiny fonts, ROT13, spoiler tags, invisible ink, encryption: each
  hides text from an eye, and none from a determined reader (UHS's CRC guards against editing, not reading).
- **The grid-level hint is a second puzzle.** Phistomefel's checkerboard link and Philip Newman's extra-givens link show
  something on the grid by linking a changed copy; no system found draws a setter's hint on the solver's own board. The CTC app
  reviewer asked for exactly that ("They don't even just highlight on the board").
- **End-of-solve messages exist everywhere; mid-solve hint fields nowhere.** SudokuPad, f-puzzles (by userscript) and Penpa+ each
  carry a setter's solved message in the puzzle data.
- **The common complaint is position.** "The hint assumes you were able to get to a certain point" (CTC app), "help with a part of
  the puzzle that a team has already figured out" (fortenforge), "useless if it doesn't address the problem your team is having"
  (Katz). The second complaint is quality: wrong cells and unexplained leaps (CTC apps).

## How each system lets the person reach the right hint

Findings, not a recommendation.

1. **Read in order and stop** (Logic Masters descriptions, GAS, CTC apps, PuzzleSpring canned, timed DASH and Bpuzzled hints).
   Simplest to write; fails when the solver is stuck somewhere other than where the next hint is, which is the main complaint.
   GAS softens it by announcing each hint's scope before it is read.
2. **Pick the question from a list, then read in order** (UHS, Invisiclues, EXIT, Unlock!, Outer Wilds guides, crossword
   apps, Puzzle Boat's topic hints). Puts the matching on the person; the list itself can spoil, which Invisiclues met with fake
   questions and Katz names as the cost of labelled canned hints.
3. **A human matches** (Logic Masters private messages, gph-site and spoilr staff copying canned hints, escape-room game masters).
   The best fit, at the cost of a person on call; the canned list stays hidden so labels spoil nothing.
4. **The system reads progress** (ClueKeeper unlocking on a partial answer, Unlock!'s "closest hidden object based on your
   progress", escape-room sensors, SudokuPad's fog triggers). Only fog acts on a sudoku grid, and it reveals clues, not text.
   Software that reads the grid and writes the hint itself (CTC Smart Hint, `pencilmark`) is the solver-made kind the map rules out.

## Searches run

Web searches (Exa-backed WebSearch, 2026-11-23), each read as its top results' extracts:

1. `logic-masters.de Rätselportal "Hinweis" hidden comment spoiler hint setter puzzle`
2. `forum.logic-masters.de hints spoiler puzzle portal comments hint feature`
3. `forum.logic-masters.de Hinweise versteckt weißer Text markieren Rätsel Beschreibung Tipp Spoiler Funktion Portal`
4. `Cracking the Cryptic app hint system "hint" Classic Sudoku app how hints work`
5. `Cracking the Cryptic Steam app hints "hint" button how many hints per puzzle sequential`
6. `"Cracking the Cryptic" app hints "next hint" OR "hint 1" OR "first hint" reviews hints in order puzzle`
7. `sudoku setter hints for puzzle "hints" spoiler tags discord variant sudoku stuck hint etiquette`
8. `"GAS 101" hints document setter Genuinely Approachable Sudoku hint doc step by step`
9. `reddit r/sudoku OR r/crackingthecryptic stuck variant puzzle hint ">!" spoiler hint setter replies` (nothing relevant)
10. `SudokuPad "solved message" OR "msgcorrect" setter message on solve f-puzzles fog of war reveal`
11. `SudokuMaker sudokumaker.app setter "hint" OR "solve message" OR "success message" feature`
12. `Penpa+ penpa-edit custom message when solved answer check "message" setter`
13. `gph-site hints canned hints puzzlehunt open source hint system`
14. `MIT Mystery Hunt canned hints tph-site spoilr hint system open source puzzlehunt CMU hints`
15. `puzzlehunt_server Puzzlehunt CMU canned hints auto hint model github`
16. `puzzle hunt auto hints keyword matching "canned hints" solvers type question automatic response hunt 2024 OR 2025`
17. `DASH puzzle hunt hints taken in order each hint costs points pre-written hints`
18. `Universal Hint System UHS file format specification progressive hints`
19. `Invisiclues Infocom invisible ink hint booklet format questions progressive answers`
20. `Outer Wilds progressive hint guide questions reveal one hint at a time spoiler-free`
21. `EXIT The Game hint cards first hint second hint solution symbol; Unlock! app hint card number`
22. `escape room hint system game master clue screen hint app pre-written hints per puzzle stage`
23. `cryptic crossword app progressive hints ladder "reveal" definition then wordplay hint levels`
24. `github variant sudoku setter hints progressive hints file SudokuPad f-puzzles userscript`
25. `greasyfork sudokupad hint setter hints script`
26. `"setter" "hints" variant sudoku progressive hints format "hint 1" "hint 2" sudokupad link puzzle`

GitHub (`gh`): repository search for "sudoku hints setter", "sudokupad hints", "sudoku progressive hints", "variant sudoku hint"
(no results), "sudokupad" and "sudoku hint" (30 each, names and descriptions only); issue search for "hint" in
`SudokuPad/sudokupad-web-issues` (one unrelated hit), `SudokuPad/sudokupad2-planning`, `SudokuPad/sudokupad_v1` and
`swaroopg92/penpa-edit` (none); code read in `galacticpuzzlehunt/gph-site` (`puzzles/models.py`, `hint.html`) and
`Palindrome-Puzzles/2022-hunt` (`spoilr/hints`).

## Not verified

- The CTC apps' hint screen was not seen: that hints come one at a time in a fixed order rests on players citing "Hint #11" and
  "hint #14" and on the reviews quoted.
- The CTC Discord was not read; its conventions come from the GAS Leak archives.
- SudokuMaker was not opened; "no hint field" there is only "not found in these searches".
- Two App Store and Steam reviews were read through mirrors (iofreeonline.com, steammaho.com), not the stores.
- How common hidden hints are across Logic Masters: four setters' pages were seen, not a count.
