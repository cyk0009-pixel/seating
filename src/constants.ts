import { GroupInput } from './types';

export const REGIONS_17 = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'
];

export const SPECIAL_GROUPS = [
  '내빈석', '수상자', '중앙회 임원석'
];

export const PRESET_LABELS = [
  { value: 200, label: '200석' },
  { value: 320, label: '320석 (백범김구기념관 기준)' },
  { value: 400, label: '400석' },
  { value: 500, label: '500석' }
];

export const INITIAL_GROUP_INPUTS: GroupInput[] = [
  ...REGIONS_17.map(name => ({ id: name, name, type: 'REGION' as const, count: 10 })),
  ...SPECIAL_GROUPS.map(name => ({ id: name, name, type: 'SPECIAL' as const, count: 10 }))
];
