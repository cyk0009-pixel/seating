export type GroupType = 'REGION' | 'SPECIAL';

export interface GroupInput {
  id: string;
  name: string;
  type: GroupType;
  count: number;
}

export type ElementType = 'TABLE' | 'STAGE' | 'ENTRANCE' | 'WALL' | 'CHAIR';

export interface LayoutElement {
  id: string;
  type: ElementType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  // Specific to tables
  groupName?: string;
  capacity?: number;
  attendees?: number;
}

export interface SimulationState {
  elements: LayoutElement[];
  selection: string[]; // IDs of selected elements
  targetCapacity: number;
}
