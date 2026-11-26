# The app's words

Rules for the copy the app shows: no tutorial text, the Guide that explains instead, what an empty state says, the est. 1RM formula, and why there are no placeholder boxes. Read this whole file before changing anything it describes, and update it in the same commit when that behaviour changes (CLAUDE.md, *Docs*).

**The app does not explain itself.** No hint under a field, no "tap", "drag" or "pinch" line, no explainer footer, no intro paragraph, no caption saying what a number means or what a button will do, no *How this works* section. The user had every one of them removed on 2026-11-06 as condescending: a lifter learns the app by using it, and a sentence volunteered beside a control is noise, and worse mid-set. Home's *How this works* accordion went with them, along with its strings and the accordion helper, and so did the deload banner's "how to run it" text and the sentences on the deload card.

What stays is text that carries something the screen cannot show any other way:

- labels, titles and button names;
- numbers, dates and units, including where a number came from ("Your best from the log", "your check-in on 12 Aug", "last time 5 × 105 kg");
- errors, and why something failed or is refused;
- the state of something: sync, notifications, a shared or read-only profile, a photo still on another device, a lift not logged yet;
- a confirm before something is destroyed, and what it destroys;
- the legal and consent text, and the password and recovery-code warnings.

**Explanations live in one place: the Guide** (`GUIDE`, `renderGuide`, `renderGuideTopic`). A new person still needs to find out how the app works, so it is all there, and only for whoever asks: a *?* button in Home's header, beside Refresh and Settings, so it is on screen the moment the app opens (a row inside Settings was too easy never to find), and a card on Home while the profile on screen has nothing logged, which stays closed on that phone once closed (`guideCardShown`, `GUIDE_CARD_OFF`). Nine topics, about a thousand words in each language, each paragraph a short bold lead and plain facts in the same voice as the rest of the app. The button names a topic mentions are not typed into its text: they are the app's own strings, passed in by `guideVars`, so a renamed button is renamed in the guide as well. A feature somebody could not work out by using it gets a sentence in the topic it belongs to, never a hint on its own screen. The formula's name stays out of the guide too.

**An empty state is one fact.** "Nothing logged yet.", "No presets yet.", "No sets yet.", and never followed by how to fill it. Where a box would hold nothing but instructions it is not drawn at all: the Progress and Body graphs with fewer than two points, and the calculator and the standards check before they have a result.

**The formula is a code detail, not a caption.** The bake-off, the comparison with Epley and the name "Wathan" belong in the comment above `rmCurve` and nowhere in the interface. Don't add a caption when adding a surface that shows an est. 1RM; the label and the number are the whole thing.

**There are no placeholder slots left in the app.** The last one, a dashed box at the foot of the Body window reading "measurement graphs, coming later", is gone along with the old placeholder() helper and its body.graphSlot strings, and the graphs it promised are built (THE BODY, AS A LINE, under Charts): a box promising a feature is something every user reads as unfinished. Don't add a "coming soon" box for the next deferred idea either; it lives in the to-do, not on a phone. (`.pb-placeholder` in `styles.css` is unrelated despite the name: it is the dashed frame of the photo drop zone and of a photo still on another device.)
