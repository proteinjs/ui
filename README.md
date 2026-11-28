# Overview

Some core react components

## PrependSafeScroller

A vertical scroller for lists that load older rows above the reader — a message history, a feed read upward. It is a plain list of real rows: nothing is reserved for rows not yet loaded and nothing is sized from a guess. When rows land above the reader, or a row above the reader grows, the height that appeared above the reader's own row is held out of the scroll range in the same layout pass, so the scroller's height and position do not change at a landing and no scroll position is written while the list is moving: rows land under a finger, a fling or a rubber band with nothing for the engine to undo, on every engine. What is held is paid with one exact scroll write — on a list stopped for one painted frame, where a finger can move it — at the list's rest (`ScrollRest`, one definition for every scroller that waits before it writes), or where the reader has run out of loaded rows. The scroller asks for more rows ahead of the reader (`onNeedMore`), tells the consumer of both moments (`onRest`, where rows the consumer holds as data can land), and shows the consumer's loading face over the start of the rows, where it takes no room.
