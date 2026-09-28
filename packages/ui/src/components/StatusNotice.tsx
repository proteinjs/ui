import React from 'react';
import { StatusToast, StatusToastMessage } from './StatusToast';

/** A transient status notice a framework surface presents: what happened, in everyday words, and whether it went wrong. */
export type StatusNotice = { message: string; isError?: boolean };

export type StatusNoticePresenter = (notice: StatusNotice) => void;

/**
 * What a framework surface gets from {@link useStatusNotice}: `present` says the notice; `host`
 * is the element the surface renders so the notice can show — the framework's own toast when the
 * application supplied no presenter, nothing when it did (its own toast host shows the notice).
 */
export interface StatusNoticeDoor {
  present: StatusNoticePresenter;
  host: React.ReactNode;
}

/**
 * The status-notice seam: the ONE door a framework surface says a transient notice through — a
 * form button's result, the long-value viewer's "Copied". A consumer application that owns a
 * toast of its own (one host in its shell, one queue, its own placement and tokens) supplies its
 * presenter once through {@link StatusNoticeProvider}, and every framework notice shows as that
 * toast — never as a second toast beside it. With no provider, the framework's own
 * {@link StatusToast} stands, rendered by the surface itself.
 */
const StatusNoticeContext = React.createContext<StatusNoticePresenter | undefined>(undefined);

export function StatusNoticeProvider({
  present,
  children,
}: {
  present: StatusNoticePresenter;
  children: React.ReactNode;
}) {
  return <StatusNoticeContext.Provider value={present}>{children}</StatusNoticeContext.Provider>;
}

/** The notice door for the surface calling it — render `host` where the surface's own toast would sit. */
export function useStatusNotice(): StatusNoticeDoor {
  const presenter = React.useContext(StatusNoticeContext);
  const [own, setOwn] = React.useState<StatusToastMessage>();
  const present = React.useCallback(
    (notice: StatusNotice) => {
      if (presenter) {
        presenter(notice);
      } else {
        setOwn({ message: notice.message, isError: notice.isError });
      }
    },
    [presenter]
  );
  const host = presenter ? null : <StatusToast status={own} onDismiss={() => setOwn(undefined)} />;
  return { present, host };
}
