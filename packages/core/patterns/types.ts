import type { Pivot } from './pivots.ts';

export type PatternKind =
  | 'rectangle'
  | 'double_top'
  | 'double_bottom'
  | 'asc_triangle'
  | 'desc_triangle'
  | 'sym_triangle'
  | 'bull_flag'
  | 'bear_flag'
  | 'head_shoulders'
  | 'inv_head_shoulders'
  | 'multi_month_range';

export type PatternGeometry = {
  kind: PatternKind;
  timeframe: string;
  pivots: Pivot[];
  startIndex: number;
  endIndex: number;
  upper: (i: number) => number;
  lower: (i: number) => number;
  breakoutSide: 'up' | 'down' | 'both';
  height: number;
  // Mức cắt lỗ TRƯỚC đệm: up = cho lệnh phá lên (Long), down = cho lệnh phá xuống (Short).
  stopRef: { up: number; down: number };
  quality: number;
  notes: string[];
};
