import type { CSSProperties } from 'react';

export const lineNumberContainerStyle = (): CSSProperties => {
  return {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'right',
    paddingInlineStart: '0px',
    paddingInlineEnd: '0px',
  };
};

export const lineNumberStyle = (numberOfLines: number): CSSProperties => {
  return {
    minWidth: `calc(${numberOfLines}ch + 20px)`,
    marginInlineStart: '0px',
    paddingInlineEnd: '20px',
    paddingInlineStart: '0px',
    display: 'inline-flex',
    justifyContent: 'flex-end',
    counterIncrement: 'line',
    lineHeight: '1.5',
    flexShrink: 0,
    fontFamily: "'Roboto Mono', monospace",
    fontSize: '14px',
    position: 'sticky',
    background: '#34353f', // Stick to code editor container
    left: 0,
  };
};

export const customStyle = (width?: number, shouldWrap = true): CSSProperties => {
  // When wrapping is enabled (the default), break long tokens anywhere so content fits the editor
  // width without a horizontal scrollbar. This preserves the legacy rendering for existing callers.
  //
  // When wrapping is disabled, keep `white-space: pre` and `word-break: normal` so long lines
  // overflow instead of wrapping; the surrounding `.editor` container provides horizontal
  // scrolling (`overflow-x: auto`).
  const base: CSSProperties = {
    width: `${width ?? 0}px`,
    background: 'transparent',
    fontSize: '14px',
    margin: '0',
    padding: '0',
    borderRadius: '0',
    overflow: 'unset',
    fontFamily: "'Roboto Mono', monospace",
  };

  if (shouldWrap) {
    return { ...base, wordBreak: 'break-all' };
  }

  return { ...base, whiteSpace: 'pre', wordBreak: 'normal', overflowWrap: 'normal' };
};
