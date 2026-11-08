# How other editors show a text box being dragged (read 2026-11-08)

Asked because Chris disliked a "lift" (shadow and 6% grow) on a dragged note in the polish prototype.

- **PowerPoint**: red dashed smart guides appear while an object is moved, at edge and centre alignment with other objects and the slide; with three or more objects, double-headed arrows show equal spacing. Smart guides also appear while resizing, when sizes match. No lift or shadow is described. ([Microsoft support](https://support.microsoft.com/en-us/office/align-and-arrange-objects-on-a-slide-5f961535-a2ae-4914-a24a-94c669903ae3), [Indezine](https://www.indezine.com/products/powerpoint/learn/interface/365/smarter-guides.html))
- **Google Slides**: red lines appear while dragging when an object's centre or edges line up with the slide's centre or other objects (Snap to Guides, on by default). No lift is described. ([Google support](https://support.google.com/docs/answer/1696521), [Advanced Google Slides PDF](https://davetaenzer.com/docs/Advanced_Google_Slides.pdf))
- **Figma**: "Snap to objects" aligns centres and outer edges while moving or resizing, with a red guide; holding Control turns snapping off for the drag. Alt-hover shows red distance measurements. ([Figma: alignment and position](https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions), [Figma: measure distances](https://help.figma.com/hc/en-us/articles/360039956974-Measure-distances-between-layers))
- **FigJam stickies**: the help pages describe placing, resizing and Alt-drag duplicating stickies; they cannot be rotated, and no drag lift is described. ([FigJam stickies](https://help.figma.com/hc/en-us/articles/1500004414322-Sticky-notes-in-FigJam))

Takeaway: the editors' drag cue is the alignment guide, not a change to the dragged object. Text Anywhere's snap guide (#531) already follows that pattern. Not read: any app's behaviour seen first-hand; these are the vendors' and tutorial writers' descriptions.

## Does the dragged object itself change look? (follow-up, same day)

- **PowerPoint 2010** showed a semi-transparent copy of the shape while it was dragged; **2013 and later** move the shape itself with no transparency, and users asked for the old look back. ([Microsoft Q&A, 2015](https://learn.microsoft.com/en-us/answers/questions/4866929/outline-while-moving-objects-in-powerpoint-2013))
- **Trello** tilts a dragged card by a fixed 3 degrees (`transform: rotate(3deg)` on the drag helper) and gives it a shadow; it does not scale it. ([Stack Overflow](https://stackoverflow.com/questions/11300735/trello-drag-and-drop-effect), [Patrick Desjardins](https://patrickdesjardins.com/blog/dragging-a-dom-element-visually-properly))
- A drag-and-drop pattern guide lists the usual cues for a lifted item: a shadow, an outline, a slight tilt, and a "ghost" left where it was; and a short (100 ms) drop animation. These are list and card patterns, where a dragged item leaves a gap. ([Smart Interface Design Patterns](https://smart-interface-design-patterns.com/articles/drag-and-drop-ux/), [commadot](https://commadot.com/drag-and-drop-order-ux-pattern/))
- The commadot write-up splits drags in two: ordering rows in a table or tree (no 3D, the original stays put and highlighted) and moving content cards (lifted towards the user).
