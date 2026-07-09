import { Fragment, useEffect, useLayoutEffect, useRef } from "react";
import type { Controller } from "./useController";

interface Props {
  controller: Controller;
  fontSize: number;
  mirror: boolean;
  readingLineFrac: number;
}

/**
 * The scrolling script. Tokens render once; the current-word highlight and the
 * scroll position are driven imperatively by the controller, so voice-following
 * never re-renders this list.
 */
export function Prompter({ controller, fontSize, mirror, readingLineFrac }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const nodes = Array.from(content.querySelectorAll<HTMLElement>("[data-i]"));
    const map: HTMLElement[] = [];
    nodes.forEach((n) => {
      map[Number(n.dataset.i)] = n;
    });
    controller.attach(container, map);
  }, [controller, controller.tokens]);

  // Re-measure when the box or the type size changes.
  useEffect(() => {
    const ro = new ResizeObserver(() => controller.recomputeOffsets());
    if (scrollRef.current) ro.observe(scrollRef.current);
    if (contentRef.current) ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [controller]);

  useLayoutEffect(() => {
    controller.recomputeOffsets();
  }, [controller, fontSize]);

  return (
    <div className="prompter-wrap" ref={wrapRef} style={{ ["--reading" as string]: `${readingLineFrac * 100}%` }}>
      <div className="reading-guide" aria-hidden="true" />
      <div className="edge-fade top" aria-hidden="true" />
      <div className="edge-fade bottom" aria-hidden="true" />
      <div className={`prompter${mirror ? " mirror" : ""}`} ref={scrollRef} style={{ fontSize: `${fontSize}px` }}>
        <div className="prompter-content" ref={contentRef}>
          {controller.tokens.map((t, i) => (
            <Fragment key={i}>
              {t.breakBefore && i > 0 ? <br /> : null}
              <span className="tok" data-i={i} onClick={() => controller.seek(i)} title="이 위치로 이동">
                {t.raw}
              </span>{" "}
            </Fragment>
          ))}
          <div className="tail-space" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
