# Overview

Some core react components

## PrependSafeScroller

A vertical scroller for lists that load older rows above the reader — a message history, a feed read upward. A reserved block above the loaded start, sized for the rows not yet loaded, shrinks by exactly the height each landed page adds, in the same layout pass, so the scroller's height and position never change at a landing and no scroll position is written: rows land under a finger, a fling or a rubber band with nothing for the engine to undo, on every engine. The scroller asks for more rows ahead of the reader (`onNeedMore`), shows the consumer's loading row at the block's foot, and makes its rare light writes — the end collapse, a refill — only at the engine's rest (`ScrollRest`, one definition for every scroller that waits before it writes).
