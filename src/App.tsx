import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { GroupInput, LayoutElement, SimulationState, ElementType } from './types';
import { INITIAL_GROUP_INPUTS, PRESET_LABELS } from './constants';
import { cn } from './lib/utils';
import { 
  Users, 
  Settings2, 
  RotateCcw, 
  Undo2, 
  Dices, 
  Save, 
  Plus, 
  Minus,
  Maximize2,
  ChevronRight,
  Monitor,
  Trash2,
  DoorOpen,
  Tally4,
  MousePointer2,
  LayoutGrid
} from 'lucide-react';

const TABLE_CAPACITY = 10;
const STAGE_DEFAULT: LayoutElement = { 
  id: 'stage-primary', 
  type: 'STAGE', 
  name: '무대', 
  x: 350, 
  y: 30, 
  width: 700, 
  height: 60 
};

type LayoutType = 'GRID' | 'DIAMOND' | 'CIRCLE' | 'STAGGERED';

export default function App() {
  const [view, setView] = useState<'input' | 'simulate'>('input');
  const [groupInputs, setGroupInputs] = useState<GroupInput[]>(INITIAL_GROUP_INPUTS);
  const [targetCapacity, setTargetCapacity] = useState<number>(320);
  
  // Simulation State
  const [state, setState] = useState<SimulationState>({ elements: [], selection: [], targetCapacity: 320 });
  const [history, setHistory] = useState<SimulationState[]>([]);
  
  // Selection Box State
  const [dragBox, setDragBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [canvasHeight, setCanvasHeight] = useState<number>(1400);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mockupRef = useRef<HTMLDivElement>(null);

  // Refs for undo/redo
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const saveToHistory = useCallback(() => {
    setHistory(prev => [...prev, JSON.parse(JSON.stringify(stateRef.current))].slice(-30));
  }, []);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setState(previous);
    setHistory(prev => prev.slice(0, -1));
  }, [history]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (stateRef.current.selection.length > 0) {
          deleteSelected();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo]);

  const handleInputChange = (id: string, value: number) => {
    const numValue = Number(value);
    setGroupInputs(prev => prev.map(input => 
      input.id === id ? { ...input, count: isNaN(numValue) ? 0 : Math.max(0, numValue) } : input
    ));
  };

  const applyPreset = (targetTotal: number) => {
    setTargetCapacity(targetTotal);
    // If we are already in simulation, we must fully regenerate to match the NEW capacity
    if (view === 'simulate') {
      setTimeout(() => {
        generateSeating('GRID', targetTotal);
      }, 0);
    }
  };

  const handleGroupNameChange = (id: string, name: string) => {
    setGroupInputs(prev => prev.map(input => 
      input.id === id ? { ...input, name } : input
    ));
  };

  const addSpecialGroup = () => {
    const id = `special-${Date.now()}`;
    setGroupInputs(prev => [...prev, { id, name: '새 특별석', type: 'SPECIAL', count: 0 }]);
  };

  const deleteGroupInput = (id: string) => {
    setGroupInputs(prev => prev.filter(input => input.id !== id));
  };

  const deleteSelected = () => {
    saveToHistory();
    setState(prev => ({
      ...prev,
      elements: prev.elements.filter(el => !prev.selection.includes(el.id)),
      selection: []
    }));
  };

  const toggleSelection = (id: string, multi: boolean) => {
    setState(prev => {
      const isSelected = prev.selection.includes(id);
      if (multi) {
        return {
          ...prev,
          selection: isSelected ? prev.selection.filter(sid => sid !== id) : [...prev.selection, id]
        };
      }
      return { ...prev, selection: [id] };
    });
  };

  const addEnvElement = (type: ElementType) => {
    saveToHistory();
    const id = `${type.toLowerCase()}-${Date.now()}`;
    let name = '';
    let width = 60, height = 60;
    if (type === 'ENTRANCE') { name = '출입구'; width = 120; height = 40; }
    else if (type === 'WALL') { name = '사이드 벽 (현수막)'; width = 20; height = 200; }
    else if (type === 'CHAIR') { name = '추가 의자'; width = 44; height = 44; }

    const newEl: LayoutElement = {
      id,
      type,
      name,
      x: 400 + Math.random() * 100,
      y: 400 + Math.random() * 100,
      width,
      height,
    };
    setState(prev => ({ ...prev, elements: [...prev.elements, newEl], selection: [id] }));
  };

  const generateSeating = (layout: LayoutType = 'GRID', overrideCapacity?: number) => {
    saveToHistory();
    const capacityToUse = overrideCapacity || targetCapacity;
    const tables: LayoutElement[] = [];
    let tableIndex = 0;
    const maxTableCount = Math.ceil(capacityToUse / TABLE_CAPACITY);

    // Seating Logic 
    const specialInputs = groupInputs.filter(g => g.type === 'SPECIAL' && g.count > 0);
    const regionInputs = groupInputs.filter(g => g.type === 'REGION' && g.count > 0);

    const specialTables: LayoutElement[] = [];
    const regionTables: LayoutElement[] = [];

    const processGroup = (group: GroupInput, targetList: LayoutElement[]) => {
      let remaining = group.count;
      while (remaining >= TABLE_CAPACITY) {
        targetList.push({
          id: `t-${tableIndex++}`,
          type: 'TABLE',
          name: group.name,
          groupName: group.name,
          capacity: TABLE_CAPACITY,
          attendees: TABLE_CAPACITY,
          width: 150,
          height: 150,
          x: 0,
          y: 0
        });
        remaining -= TABLE_CAPACITY;
      }
      return remaining;
    };

    const allRemainders: { name: string; count: number }[] = [];
    specialInputs.forEach(g => {
      const rem = processGroup(g, specialTables);
      if (rem > 0) allRemainders.push({ name: g.name, count: rem });
    });

    regionInputs.forEach(g => {
      const rem = processGroup(g, regionTables);
      if (rem > 0) allRemainders.push({ name: g.name, count: rem });
    });

    // Smarter Greedy Packing for Shared Tables
    const sharedTables: LayoutElement[] = [];
    // Sort descending to fill large gaps first (First Fit Decreasing strategy)
    const sortedRemainders = [...allRemainders].sort((a, b) => b.count - a.count);

    while (sortedRemainders.length > 0) {
      let currentTableItems: { name: string; count: number }[] = [];
      let currentSum = 0;
      
      // Try to fill one table of 10 as much as possible
      for (let i = 0; i < sortedRemainders.length; i++) {
        if (currentSum + sortedRemainders[i].count <= TABLE_CAPACITY) {
          const item = sortedRemainders.splice(i, 1)[0];
          currentTableItems.push(item);
          currentSum += item.count;
          i--; // Adjust index due to splice
        }
      }

      if (currentTableItems.length > 0) {
        sharedTables.push({
          id: `t-shared-${tableIndex++}`,
          type: 'TABLE',
          name: currentTableItems.map(p => p.name).join('/'),
          groupName: currentTableItems.map(p => p.name).join('/'),
          capacity: TABLE_CAPACITY,
          attendees: currentSum,
          width: 150,
          height: 150,
          x: 0, y: 0
        });
      }
    }

    let allGeneratedTables = [...specialTables, ...regionTables, ...sharedTables];
    
    // STRICTLY enforce the capacity limit to reflect the physical host's venue size
    // If the number of tables needed for attendees exceeds the venue capacity, 
    // we slice the tables to match the venue size, effectively showing seat deficiency.
    if (allGeneratedTables.length > maxTableCount) {
      allGeneratedTables = allGeneratedTables.slice(0, maxTableCount);
    } else {
      while (allGeneratedTables.length < maxTableCount) {
        allGeneratedTables.push({
          id: `t-empty-${tableIndex++}`,
          type: 'TABLE',
          name: '빈 테이블',
          groupName: '빈 테이블',
          capacity: TABLE_CAPACITY,
          attendees: 0,
          width: 150,
          height: 150,
          x: 0,
          y: 0
        });
      }
    }

    const canvasWidth = 1400;
    const paddingX = 200;
    const paddingY = 180;
    const startY = 180;
    const columns = 6;
    const totalRows = Math.ceil(allGeneratedTables.length / columns);
    const calculatedHeight = Math.max(1400, startY + totalRows * paddingY + 300);
    setCanvasHeight(calculatedHeight);

    allGeneratedTables.forEach((t, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const rowWidth = (Math.min(allGeneratedTables.length - row * columns, columns) - 1) * paddingX;
      const startX = (canvasWidth - rowWidth) / 2 - 75;
      
      t.x = startX + col * paddingX;
      t.y = startY + row * paddingY;
      
      if (layout === 'STAGGERED' && row % 2 === 1) {
        t.x += paddingX / 2;
      }
    });

    const entrances: LayoutElement[] = [
      { id: 'ent-1', type: 'ENTRANCE', name: '입구 1', x: 100, y: calculatedHeight - 120, width: 160, height: 60 },
      { id: 'ent-2', type: 'ENTRANCE', name: '입구 2', x: 1100, y: calculatedHeight - 120, width: 160, height: 60 },
    ];

    setState({ elements: [STAGE_DEFAULT, ...entrances, ...allGeneratedTables], selection: [], targetCapacity: capacityToUse });
    setView('simulate');
  };

  const reset = () => {
    if (confirm('모든 수치와 배치를 초기화하시겠습니까?')) {
      // Deep copy to ensure fresh state
      setGroupInputs(INITIAL_GROUP_INPUTS.map(g => ({ ...g })));
      setTargetCapacity(320);
      setState({ elements: [], selection: [], targetCapacity: 320 });
      setHistory([]);
      setView('input');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (e.target !== canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    setDragBox({
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      currentX: e.clientX - rect.left,
      currentY: e.clientY - rect.top
    });
    setState(prev => ({ ...prev, selection: [] }));
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!dragBox || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    setDragBox(prev => prev ? { ...prev, currentX, currentY } : null);

    const xMin = Math.min(dragBox.startX, currentX);
    const xMax = Math.max(dragBox.startX, currentX);
    const yMin = Math.min(dragBox.startY, currentY);
    const yMax = Math.max(dragBox.startY, currentY);

    const newSelection = state.elements
      .filter(el => {
        const elMidX = el.x + el.width / 2;
        const elMidY = el.y + el.height / 2;
        return elMidX >= xMin && elMidX <= xMax && elMidY >= yMin && elMidY <= yMax;
      })
      .map(el => el.id);

    setState(prev => ({ ...prev, selection: newSelection }));
  };

  const handleCanvasMouseUp = () => setDragBox(null);

  const updateElementPos = (id: string, x: number, y: number) => {
    if (state.selection.includes(id)) {
      const target = state.elements.find(el => el.id === id);
      if (!target) return;
      const dx = x - target.x;
      const dy = y - target.y;

      setState(prev => ({
        ...prev,
        elements: prev.elements.map(el => 
          prev.selection.includes(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el
        )
      }));
    } else {
      setState(prev => ({
        ...prev,
        elements: prev.elements.map(el => el.id === id ? { ...el, x, y } : el),
        selection: [id]
      }));
    }
  };

  const goHome = () => {
    setView('input');
    setCanvasHeight(1400); // Reset height
    setState({ elements: [], selection: [], targetCapacity: state.targetCapacity });
    setHistory([]);
  };

  const exportAsImage = async () => {
    if (!mockupRef.current) return;
    try {
      const dataUrl = await toPng(mockupRef.current, {
        backgroundColor: '#ffffff',
        quality: 1,
        pixelRatio: 2,
        skipFonts: false,
      });
      const link = document.createElement('a');
      link.download = `좌석배치도_${new Date().toLocaleDateString()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('이미지 저장 실패:', err);
      alert('이미지 저장 중 오류가 발생했습니다. (브라우저 호환성 문제일 수 있습니다)');
    }
  };

  const exportAsPDF = async () => {
    if (!mockupRef.current) return;
    try {
      const dataUrl = await toPng(mockupRef.current, {
        backgroundColor: '#ffffff',
        quality: 1,
        pixelRatio: 2,
        skipFonts: false,
      });
      
      const img = new Image();
      img.src = dataUrl;
      img.onload = () => {
        const imgWidth = img.width;
        const imgHeight = img.height;
        
        const pdf = new jsPDF({
          orientation: imgWidth > imgHeight ? 'l' : 'p',
          unit: 'px',
          format: [imgWidth, imgHeight]
        });
        
        pdf.addImage(dataUrl, 'PNG', 0, 0, imgWidth, imgHeight);
        pdf.save(`좌석배치도_${new Date().toLocaleDateString()}.pdf`);
      };
    } catch (err) {
      console.error('PDF 저장 실패:', err);
      alert('PDF 저장 중 오류가 발생했습니다.');
    }
  };

  const totalAttendees = groupInputs.reduce((acc, g) => acc + (Number(g.count) || 0), 0);
  const currentTotalCapacity = state.elements.reduce((acc, el) => {
    if (el.type === 'TABLE') return acc + TABLE_CAPACITY;
    if (el.type === 'CHAIR') return acc + 1;
    return acc;
  }, 0);
  
  const assignedAttendees = state.elements.reduce((acc, el) => {
    if (el.type === 'TABLE') return acc + (el.attendees || 0);
    if (el.type === 'CHAIR') return acc + 1;
    return acc;
  }, 0);

  const unassignedCount = Math.max(0, totalAttendees - assignedAttendees);
  const balance = currentTotalCapacity - totalAttendees;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-100 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0 shadow-sm z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-black text-white text-lg shadow-lg shadow-blue-100">
            H
          </div>
          <div>
            <h1 className="font-extrabold text-xl tracking-tight text-slate-900">한국노인복지중앙회 행사 좌석배치 생성기</h1>
            <div className="flex items-center gap-2">
              <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">Sim Center v3.5</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-xl border border-slate-200/50">
            {PRESET_LABELS.map(p => (
              <button
                key={p.value}
                onClick={() => applyPreset(p.value)}
                className="px-5 py-3 text-sm font-black rounded-lg hover:bg-white hover:shadow-md transition-all text-slate-600 hover:text-blue-600 whitespace-nowrap border border-transparent hover:border-blue-100"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={goHome}
              className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              <Users className="w-4 h-4" /> 홈으로
            </button>
            <button 
              onClick={reset}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-slate-100"
            >
              <RotateCcw className="w-4 h-4" /> 초기화
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative flex flex-col">
        <AnimatePresence mode="wait">
          {view === 'input' ? (
            <motion.div
              key="input"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="flex-1 overflow-y-auto p-12 bg-white"
            >
              <div className="max-w-5xl mx-auto space-y-16">
                <div className="flex flex-col gap-10 border-b border-slate-100 pb-12">
                  <div>
                    <h2 className="text-5xl font-black text-slate-900 tracking-tight mb-4">대관 장소 (규모) 선택</h2>
                    <p className="text-2xl text-slate-500 font-medium tracking-tight">행사장의 전체 수용 인원을 먼저 선택해 주세요.</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                    {PRESET_LABELS.map(p => (
                      <button
                        key={p.value}
                        onClick={() => applyPreset(p.value)}
                        className={cn(
                          "flex flex-col items-center justify-center p-10 rounded-[40px] border-4 transition-all gap-4 group",
                          targetCapacity === p.value 
                            ? "bg-blue-600 border-blue-600 text-white shadow-2xl shadow-blue-200 scale-105" 
                            : "bg-white border-slate-100 text-slate-400 hover:border-blue-200 hover:text-blue-500"
                        )}
                      >
                        <Monitor className={cn("w-10 h-10", targetCapacity === p.value ? "text-blue-200" : "text-slate-200 opacity-50")} />
                        <span className="text-3xl font-black tracking-tighter">{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-end justify-between border-b border-slate-100 pb-8 pt-4">
                  <div>
                    <h2 className="text-5xl font-black text-slate-900 tracking-tight mb-4">참석 인원 상세 정보 ({totalAttendees}명)</h2>
                    <p className="text-2xl text-slate-500 font-medium tracking-tight">지방협회 및 특별 테이블 인원을 확인해 주세요.</p>
                  </div>
                  <div className="flex gap-4">
                    <button
                      onClick={() => generateSeating('GRID')}
                      className="px-16 py-8 bg-blue-600 hover:bg-blue-700 text-white rounded-[40px] font-black transition-all shadow-2xl shadow-blue-200 text-2xl flex items-center gap-6 group scale-110 mb-2"
                    >
                      좌석도 생성 <ChevronRight className="w-10 h-10 group-hover:translate-x-2 transition-transform" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {/* Regions Grid */}
                  <div className="md:col-span-2 space-y-6">
                    <h3 className="text-xl font-black text-blue-600 uppercase tracking-[0.2em] px-2 flex items-center gap-3 mb-4">
                       <div className="w-3 h-3 rounded-full bg-blue-600" />
                       전국 지방협회 인원
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {groupInputs.filter(g => g.type === 'REGION').map(input => (
                        <div key={input.id} className="bg-slate-50 rounded-3xl p-6 border-2 border-slate-100 flex items-center justify-between group hover:border-blue-400 transition-all hover:bg-white hover:shadow-xl">
                          <label className="text-xl font-black text-slate-700">{input.name}</label>
                          <div className="flex items-center gap-4 bg-white rounded-2xl border-2 p-2 border-slate-100">
                             <button onClick={() => handleInputChange(input.id, input.count - 1)} className="w-12 h-12 rounded-xl hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-blue-600"><Minus className="w-6 h-6" /></button>
                             <input type="number" value={input.count} onChange={(e) => handleInputChange(input.id, Number(e.target.value))} className="w-16 text-center text-2xl font-black text-slate-800 bg-transparent focus:outline-none" />
                             <button onClick={() => handleInputChange(input.id, input.count + 1)} className="w-12 h-12 rounded-xl hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-blue-600"><Plus className="w-6 h-6" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Special Groups */}
                  <div className="space-y-8">
                    <div className="flex items-center justify-between px-2">
                      <h3 className="text-xl font-black text-rose-500 uppercase tracking-[0.2em] flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-rose-500" />
                        특별 테이블 및 지정석
                      </h3>
                      <button 
                        onClick={addSpecialGroup}
                        className="p-3 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors shadow-sm"
                        title="특별 테이블 추가"
                      >
                        <Plus className="w-6 h-6" />
                      </button>
                    </div>
                    <div className="space-y-6">
                      {groupInputs.filter(g => g.type === 'SPECIAL').map(input => (
                        <div key={input.id} className="bg-rose-50/30 rounded-[32px] p-8 border-2 border-rose-100/50 flex flex-col gap-6 group relative hover:bg-white hover:shadow-xl transition-all">
                          <button 
                            onClick={() => deleteGroupInput(input.id)}
                            className="absolute top-6 right-6 p-2 text-rose-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-all scale-125"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                          <input 
                            type="text"
                            value={input.name}
                            onChange={(e) => handleGroupNameChange(input.id, e.target.value)}
                            className="text-2xl font-black text-slate-800 bg-transparent border-b-2 border-transparent focus:border-rose-400 focus:outline-none w-4/5 pb-2"
                            placeholder="테이블 이름 입력"
                          />
                          <div className="flex items-center justify-end mt-2">
                             <div className="flex items-center gap-4 bg-white rounded-2xl border-2 p-2 border-rose-100">
                               <button onClick={() => handleInputChange(input.id, input.count - 1)} className="w-12 h-12 rounded-xl text-rose-300 hover:text-rose-500"><Minus className="w-6 h-6" /></button>
                               <input type="number" value={input.count} onChange={(e) => handleInputChange(input.id, Number(e.target.value))} className="w-16 text-center text-2xl font-black text-slate-800 focus:outline-none bg-transparent" />
                               <button onClick={() => handleInputChange(input.id, input.count + 1)} className="w-12 h-12 rounded-xl text-rose-300 hover:text-rose-500"><Plus className="w-6 h-6" /></button>
                             </div>
                          </div>
                        </div>
                      ))}
                      {groupInputs.filter(g => g.type === 'SPECIAL').length === 0 && (
                        <div className="p-8 border-2 border-dashed border-slate-100 rounded-3xl flex flex-col items-center justify-center text-slate-300 gap-2">
                           <Settings2 className="w-8 h-8 opacity-20" />
                           <span className="text-xs font-bold">특별 테이블이 없습니다.</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="simulate"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col overflow-hidden bg-slate-200/50"
            >
              {/* Simulation Toolbar */}
              <div className="px-8 py-3 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between z-40">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-4">Layout Options</span>
                  <button onClick={() => generateSeating('GRID')} className="p-2.5 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded-xl transition-all" title="기본 격자 (Grid)"><LayoutGrid className="w-4 h-4" /></button>
                  <button onClick={() => generateSeating('STAGGERED')} className="p-2.5 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded-xl transition-all" title="지그재그 (5-4-5-4)"><Tally4 className="w-4 h-4" /></button>
                  <button onClick={() => generateSeating('DIAMOND')} className="p-2.5 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded-xl transition-all" title="다이아몬드 (Diamond)"><Maximize2 className="w-4 h-4" /></button>
                  
                  <div className="w-px h-6 bg-slate-200 mx-2" />
                  
                  <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                    <Users className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-xs font-bold text-slate-600">수용 가능: {currentTotalCapacity}석 / 예정: {totalAttendees}명</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                   <button onClick={() => addEnvElement('CHAIR')} className="flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 rounded-lg text-[10px] font-bold text-blue-600 border border-blue-100"><Users className="w-3.5 h-3.5" /> 의자 추가</button>
                   <button onClick={() => addEnvElement('ENTRANCE')} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-bold text-slate-600 border border-slate-200"><DoorOpen className="w-3.5 h-3.5" /> 출입구 추가</button>
                   <button onClick={() => addEnvElement('WALL')} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-bold text-slate-600 border border-slate-200"><Tally4 className="w-3.5 h-3.5" /> 사이드 벽 추가</button>
                   <div className="w-px h-6 bg-slate-200 mx-2" />
                    <button onClick={undo} disabled={history.length === 0} className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 disabled:opacity-20"><Undo2 className="w-4 h-4" /></button>
                    <button onClick={deleteSelected} disabled={state.selection.length === 0} className="p-2.5 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl disabled:opacity-20"><Trash2 className="w-4 h-4" /></button>
                    <div className="w-px h-6 bg-slate-200 mx-2" />
                    <button onClick={exportAsImage} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-100 transition-all">
                      이미지 저장
                    </button>
                    <button onClick={exportAsPDF} className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold border border-blue-100 transition-all">
                      PDF 저장
                    </button>
                    <button onClick={() => setView('input')} className="px-5 py-2.5 bg-slate-800 text-white rounded-xl text-xs font-bold ml-4">기본 정보 수정</button>
                </div>
              </div>

              <div className="flex-1 overflow-auto relative bg-slate-200/50 pb-32">
                {/* Linear Status Bar (Fixed at Bottom) */}
                <div className="fixed bottom-0 left-0 right-0 z-[100] bg-white/90 backdrop-blur-xl border-t border-slate-200 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] px-12 py-6">
                  <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg">
                        <Users className="w-6 h-6" />
                      </div>
                      <h4 className="text-xl font-black text-slate-900 tracking-tighter whitespace-nowrap">실시간 좌석 현황</h4>
                    </div>

                    <div className="flex-1 flex items-center justify-around bg-slate-50 rounded-[28px] py-4 px-8 border border-slate-100">
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">참석 예정 (고정)</span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-3xl font-black text-slate-900 tracking-tighter">{totalAttendees}명</span>
                        </div>
                      </div>
                      
                      <div className="w-px h-10 bg-slate-200" />
                      
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">현재 확보 좌석</span>
                        <span className="text-3xl font-black text-blue-600 tracking-tighter">{currentTotalCapacity}석</span>
                      </div>

                      <div className="w-px h-10 bg-slate-200" />

                      <div className="flex flex-col items-center">
                        <span className={cn(
                          "text-[10px] font-black uppercase tracking-widest mb-1",
                          balance >= 0 ? "text-slate-400" : "text-rose-600 font-extrabold"
                        )}>
                          {balance >= 0 ? "현재 공석" : "⚠️ 주의! 좌석 부족"}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-4xl font-black tracking-tighter transition-all",
                            balance >= 0 ? "text-emerald-600" : "text-rose-600 scale-110 drop-shadow-sm"
                          )}>
                            {balance > 0 ? `+${balance}` : balance}석
                          </span>
                        </div>
                      </div>
                    </div>

                    {balance < 0 && (
                      <div className="flex items-center gap-4 bg-rose-600 px-8 py-4 rounded-[30px] border-4 border-rose-300 text-white shadow-2xl shadow-rose-200 animate-pulse">
                        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                          <Users className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-black tracking-tight leading-none">인원 초과!</span>
                          <span className="text-[10px] font-bold opacity-80">의자/테이블을 추가하세요</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div 
                  ref={canvasRef}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  className="p-40 relative"
                >
                  <div 
                    ref={mockupRef}
                    id="simulation-canvas"
                    className="min-w-[1400px] relative bg-white rounded-[80px] shadow-2xl shadow-slate-300 border-4 border-white ring-1 ring-slate-200 p-20"
                    style={{ minHeight: canvasHeight }}
                  >
                    
                    {/* Elements */}
                  {state.elements.map((el) => {
                    const isSelected = state.selection.includes(el.id);
                    return (
                      <motion.div
                        key={el.id}
                        drag
                        dragMomentum={false}
                        onDragStart={saveToHistory}
                        onDragEnd={(_, info) => updateElementPos(el.id, el.x + info.offset.x, el.y + info.offset.y)}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          toggleSelection(el.id, e.shiftKey || e.ctrlKey || e.metaKey);
                        }}
                        initial={{ x: el.x, y: el.y }}
                        animate={{ x: el.x, y: el.y }}
                        className={cn(
                          "absolute cursor-move select-none group",
                          isSelected && "z-50"
                        )}
                        style={{ width: el.width, height: el.height }}
                      >
                        {/* Delete Button for selection */}
                        {isSelected && (
                          <button
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              deleteSelected();
                            }}
                            className="absolute -top-3 -right-3 w-7 h-7 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-rose-600 z-[60] border-2 border-white"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {el.type === 'STAGE' && (
                          <div className={cn(
                            "w-full h-full bg-slate-900 rounded-2xl flex items-center justify-center text-white font-black tracking-[1.5em] text-sm shadow-2xl border-4 transition-all",
                            isSelected ? "border-blue-500 scale-105" : "border-slate-800"
                          )}>
                             S T A G E
                          </div>
                        )}

                        {el.type === 'ENTRANCE' && (
                          <div className={cn(
                            "w-full h-full bg-amber-50 border-4 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg",
                            isSelected ? "border-blue-500 shadow-xl scale-110" : "border-amber-200"
                          )}>
                             <DoorOpen className="w-8 h-8 text-amber-500" />
                             <span className="text-lg font-black text-amber-700">입구</span>
                          </div>
                        )}

                        {el.type === 'WALL' && (
                          <div className={cn(
                            "w-full h-full bg-slate-100 border-x-4 border-slate-300 flex items-center justify-center transition-all",
                            isSelected ? "border-blue-500 bg-blue-50 shadow-lg scale-105" : ""
                          )}>
                             <span className="text-[10px] font-black text-slate-400 rotate-90 whitespace-nowrap">SIDE WALL / BANNER ZONE</span>
                          </div>
                        )}

                        {el.type === 'CHAIR' && (
                          <div className={cn(
                            "w-full h-full bg-blue-500 rounded-lg flex items-center justify-center text-white shadow-lg transition-all",
                            isSelected ? "ring-4 ring-blue-200 scale-110" : ""
                          )}>
                             <Users className="w-5 h-5" />
                          </div>
                        )}

                        {el.type === 'TABLE' && (
                          <div className={cn(
                            "w-full h-full flex flex-col items-center justify-center transition-all",
                            isSelected ? "scale-110" : ""
                          )}>
                            <div className={cn(
                              "w-[150px] h-[150px] bg-white rounded-full shadow-2xl border-4 relative flex flex-col items-center justify-center p-4 transition-all",
                              isSelected ? "border-blue-500 shadow-blue-200" : "border-slate-100"
                            )}>
                              <div className={cn(
                                "font-black text-slate-900 tracking-tighter leading-none mb-2 text-center px-2 overflow-hidden",
                                el.groupName && el.groupName.length > 8 ? "text-xs" : "text-lg"
                              )}>
                                {el.groupName}
                              </div>
                               <div className="flex flex-col items-center bg-slate-50/50 px-3 py-1 rounded-xl border border-slate-100">
                                 <span className={cn(
                                   "text-3xl font-black leading-none", // Increased size to 3xl
                                   (el.attendees || 0) > 0 ? "text-blue-600" : "text-slate-400"
                                 )}>
                                   {Number(el.attendees) || 0}명
                                 </span>
                                 <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">{TABLE_CAPACITY}석</span>
                               </div>

                              {/* Chairs around table */}
                              {[...Array(TABLE_CAPACITY)].map((_, i) => {
                                const angle = (i / TABLE_CAPACITY) * Math.PI * 2;
                                const r = 68; // Increased radius for larger table
                                const isOccupied = i < (el.attendees || 0);
                                return (
                                  <div 
                                    key={i}
                                    className={cn(
                                      "absolute w-5 h-5 rounded-md shadow-sm border transition-all",
                                      isOccupied ? "bg-slate-700 border-slate-900" : "bg-slate-50 border-slate-200 opacity-20"
                                    )}
                                    style={{ 
                                      left: '50%', top: '50%',
                                      transform: `translate(-50%, -50%) translate(${Math.cos(angle) * r}px, ${Math.sin(angle) * r}px) rotate(${angle}rad)` 
                                    }}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}

                  {/* Environment Boundaries Grid Overlay */}
                  <div className="absolute inset-0 opacity-[0.15] pointer-events-none rounded-[80px]" 
                       style={{ 
                         backgroundImage: 'linear-gradient(#f1f5f9 1px, transparent 1px), linear-gradient(90deg, #f1f5f9 1px, transparent 1px)', 
                         backgroundSize: '50px 50px' 
                       }} 
                  />
                  <div className="absolute inset-0 opacity-[0.05] pointer-events-none rounded-[80px]" 
                       style={{ 
                         backgroundImage: 'linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)', 
                         backgroundSize: '150px 150px' 
                       }} 
                  />
                </div>
              </div>
            </div>

              {/* Selection Lasso Box */}
              {dragBox && (
                <div 
                  className="fixed border-2 border-blue-500 bg-blue-500/10 pointer-events-none z-[100]"
                  style={{
                    left: Math.min(dragBox.startX, dragBox.currentX) + (canvasRef.current?.getBoundingClientRect().left || 0),
                    top: Math.min(dragBox.startY, dragBox.currentY) + (canvasRef.current?.getBoundingClientRect().top || 0),
                    width: Math.abs(dragBox.currentX - dragBox.startX),
                    height: Math.abs(dragBox.currentY - dragBox.startY)
                  }}
                />
              )}

              {/* Footer Control Info */}
              <div className="h-12 bg-white border-t border-slate-200 flex items-center justify-between px-8 text-[11px] font-bold text-slate-400">
                <div className="flex items-center gap-6">
                   <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 bg-slate-700 rounded" /> 착석 완료</div>
                   <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 bg-slate-100 border rounded" /> 공석</div>
                   <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 bg-blue-500 rounded" /> 선택됨</div>
                </div>
                <div className="flex items-center gap-4">
                   <span>Lasso: Canvas Click + Drag</span>
                   <span>Undo: Ctrl + Z</span>
                   <span>Delete: Del / Backspace</span>
                   <span className="text-blue-500 font-black">Admin Mode Active</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
