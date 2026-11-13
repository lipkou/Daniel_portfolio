export type NodeType =
  | "start"
  | "end"
  | "process"
  | "io"
  | "decision"
  | "loop"
  /** subroutine call (predefined process) */
  | "call"
  /** subroutine entry / exit */
  | "entry"
  | "return";

export interface CallSpec {
  /** id of the subroutine's `entry` node */
  entry: string;
  /** [parameter, argument expression evaluated in the caller] */
  args: [string, string][];
  /** caller variable that receives the result */
  result: string;
  /** subroutine variable holding the return value */
  returns: string;
}
export type Side = "top" | "bottom" | "left" | "right";
export type When = "yes" | "no" | "body" | "exit";

export interface FlowNode {
  id: string;
  type: NodeType;
  text: string;
  /** centre column, in character cells */
  x: number;
  /** top row, in character cells (every shape is 3 rows tall) */
  y: number;
  input?: string[];
  assign?: [string, string][];
  print?: string[];
  message?: string;
  cond?: string;
  loop?: { var: string; from: string; to: string; step: string };
  call?: CallSpec;
}

export interface FlowEdge {
  from: string;
  to: string;
  from_side?: Side;
  to_side?: Side;
  via?: [number, number][];
  when?: When;
  label?: string;
}

/** `number`/`array` are plain math values; the rest mimic C types (validated like C would). */
export type InputKind = "number" | "array" | "int" | "uint" | "float" | "double" | "char";

export interface InputSpec {
  name: string;
  label: string;
  kind: InputKind;
  length?: number;
  default: number | string;
}

export interface Preset {
  label: string;
  values: Record<string, number | string>;
}

export interface FlowModel {
  note?: string;
  inputs: InputSpec[];
  presets?: Preset[];
  symbols?: Record<string, string>;
  /** C type of a variable, used to show e.g. how a float is really stored */
  ctypes?: Record<string, string>;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export type Value = number | number[] | string;
