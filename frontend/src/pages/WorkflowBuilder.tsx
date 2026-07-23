import React, { useState, useEffect, useRef } from 'react';
import { useSessionStore } from '../store/sessionStore';
import {
  Play,
  Save,
  RotateCcw,
  History,
  Download,
  Upload,
  Search,
  Plus,
  Trash2,
  Copy,
  Layers,
  Zap,
  GitBranch,
  Send,
  MessageSquare,
  Cpu,
  Clock,
  Filter,
  Globe,
  Settings,
  CheckCircle2,
  AlertCircle,
  X,
  FileJson
} from 'lucide-react';

interface NodeItem {
  id: string;
  type: 'trigger' | 'logic' | 'action';
  subtype: string;
  label: string;
  x: number;
  y: number;
  config: Record<string, any>;
}

interface ConnectionItem {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  version: number;
  nodes: any[];
  connections: any[];
}

const NODE_CATALOG = [
  // Triggers
  { type: 'trigger', subtype: 'whatsapp_message', label: 'New WhatsApp Message', icon: MessageSquare, desc: 'Fires when a contact sends a WhatsApp DM' },
  { type: 'trigger', subtype: 'keyword_trigger', label: 'Keyword Trigger', icon: Search, desc: 'Fires on specific keyword match in text' },
  { type: 'trigger', subtype: 'group_join', label: 'Group Join Event', icon: Zap, desc: 'Fires when a new participant joins group' },
  { type: 'trigger', subtype: 'schedule_trigger', label: 'Schedule Cron', icon: Clock, desc: 'Fires on scheduled timer interval' },
  { type: 'trigger', subtype: 'webhook', label: 'Webhook Trigger', icon: Globe, desc: 'Fires when an external API posts JSON' },

  // Logic
  { type: 'logic', subtype: 'if', label: 'IF Condition', icon: GitBranch, desc: 'Branch execution based on IF statement' },
  { type: 'logic', subtype: 'delay', label: 'Delay Timer', icon: Clock, desc: 'Pause workflow for X seconds' },
  { type: 'logic', subtype: 'random_delay', label: 'Random Jitter Delay', icon: Clock, desc: 'Random Anti-Ban sleep (3s-10s)' },
  { type: 'logic', subtype: 'filter', label: 'Text Filter', icon: Filter, desc: 'Filter execution branch by rules' },

  // Actions
  { type: 'action', subtype: 'send_message', label: 'Send WhatsApp Text', icon: Send, desc: 'Send text message to contact or group' },
  { type: 'action', subtype: 'ai_response', label: 'AI LLM Response', icon: Cpu, desc: 'Generate response using Pollinations/Groq' },
  { type: 'action', subtype: 'react_message', label: 'React Emoji', icon: Zap, desc: 'Add emoji reaction to message' },
  { type: 'action', subtype: 'http_request', label: 'HTTP API Call', icon: Globe, desc: 'Make GET/POST request to external API' }
];

export default function WorkflowBuilder() {
  const { activeSessionId } = useSessionStore();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [currentWorkflow, setCurrentWorkflow] = useState<Workflow | null>(null);

  // Canvas State
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [selectedNode, setSelectedNode] = useState<NodeItem | null>(null);
  const [connectingSourceId, setConnectingSourceId] = useState<string | null>(null);
  const [connectingHandle, setConnectingHandle] = useState<string | null>(null);

  // UI & Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | 'trigger' | 'logic' | 'action'>('all');
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Undo/Redo & Clipboard
  const [undoStack, setUndoStack] = useState<{ nodes: NodeItem[]; connections: ConnectionItem[] }[]>([]);
  const [redoStack, setRedoStack] = useState<{ nodes: NodeItem[]; connections: ConnectionItem[] }[]>([]);
  const [clipboard, setClipboard] = useState<NodeItem | null>(null);

  // Zoom & Pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchWorkflows();
  }, [activeSessionId]);

  const fetchWorkflows = async () => {
    try {
      const res = await fetch(`/api/workflows?sessionId=${activeSessionId}`);
      const data = await res.json();
      if (data.success && data.workflows.length > 0) {
        setWorkflows(data.workflows);
        loadWorkflowIntoCanvas(data.workflows[0]);
      } else {
        createNewWorkflow();
      }
    } catch (e) {}
  };

  const createNewWorkflow = () => {
    const newWf: Workflow = {
      id: '',
      name: 'New Enterprise Workflow',
      isActive: true,
      version: 1,
      nodes: [],
      connections: []
    };
    setCurrentWorkflow(newWf);
    setNodes([
      {
        id: 'node_trigger_1',
        type: 'trigger',
        subtype: 'whatsapp_message',
        label: 'New WhatsApp Message',
        x: 100,
        y: 200,
        config: {}
      },
      {
        id: 'node_action_1',
        type: 'action',
        subtype: 'send_message',
        label: 'Send WhatsApp Text',
        x: 500,
        y: 200,
        config: { message: 'Hello! Your message was received.' }
      }
    ]);
    setConnections([
      { id: 'edge_1', source: 'node_trigger_1', target: 'node_action_1' }
    ]);
  };

  const loadWorkflowIntoCanvas = (wf: Workflow) => {
    setCurrentWorkflow(wf);
    const parsedNodes: NodeItem[] = (wf.nodes || []).map((n: any) => ({
      id: n.nodeId,
      type: n.type as any,
      subtype: n.subtype,
      label: n.label,
      x: n.positionX,
      y: n.positionY,
      config: JSON.parse(n.configJson || '{}')
    }));
    const parsedConns: ConnectionItem[] = (wf.connections || []).map((c: any) => ({
      id: c.edgeId,
      source: c.sourceNodeId,
      target: c.targetNodeId,
      sourceHandle: c.sourceHandle
    }));
    setNodes(parsedNodes);
    setConnections(parsedConns);
  };

  const pushStateToUndo = () => {
    setUndoStack(prev => [...prev, { nodes: [...nodes], connections: [...connections] }]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setRedoStack(prev => [...prev, { nodes: [...nodes], connections: [...connections] }]);
    setNodes(last.nodes);
    setConnections(last.connections);
    setUndoStack(prev => prev.slice(0, -1));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(prev => [...prev, { nodes: [...nodes], connections: [...connections] }]);
    setNodes(next.nodes);
    setConnections(next.connections);
    setRedoStack(prev => prev.slice(0, -1));
  };

  const addNodeToCanvas = (catalogItem: typeof NODE_CATALOG[0]) => {
    pushStateToUndo();
    const newId = `node_${Date.now()}`;
    const newNode: NodeItem = {
      id: newId,
      type: catalogItem.type as any,
      subtype: catalogItem.subtype,
      label: catalogItem.label,
      x: 300 - pan.x,
      y: 250 - pan.y,
      config: catalogItem.subtype === 'send_message' ? { message: 'Hello from Ana Workflow!' } : {}
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedNode(newNode);
  };

  const saveWorkflow = async () => {
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentWorkflow?.id || undefined,
          name: currentWorkflow?.name || 'Enterprise Workflow',
          sessionId: activeSessionId,
          isActive: currentWorkflow?.isActive ?? true,
          nodes: nodes.map(n => ({
            id: n.id,
            type: n.type,
            position: { x: n.x, y: n.y },
            data: { label: n.label, subtype: n.subtype, config: n.config }
          })),
          connections: connections.map(c => ({
            id: c.id,
            source: c.source,
            target: c.target,
            sourceHandle: c.sourceHandle
          }))
        })
      });
      const data = await res.json();
      if (data.success) {
        setCurrentWorkflow(data.workflow);
        setStatusMsg('Workflow Saved & Deployed Successfully!');
        setTimeout(() => setStatusMsg(''), 3000);
      }
    } catch (e) {}
  };

  const handleNodeClick = (node: NodeItem) => {
    if (connectingSourceId) {
      if (connectingSourceId !== node.id) {
        pushStateToUndo();
        const newEdge: ConnectionItem = {
          id: `edge_${Date.now()}`,
          source: connectingSourceId,
          target: node.id,
          sourceHandle: connectingHandle || undefined
        };
        setConnections(prev => [...prev, newEdge]);
      }
      setConnectingSourceId(null);
      setConnectingHandle(null);
    } else {
      setSelectedNode(node);
    }
  };

  const deleteSelectedNode = (nodeId: string) => {
    pushStateToUndo();
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setConnections(prev => prev.filter(c => c.source !== nodeId && c.target !== nodeId));
    if (selectedNode?.id === nodeId) setSelectedNode(null);
  };

  const exportWorkflowJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ nodes, connections }, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `${currentWorkflow?.name || 'workflow'}.json`);
    dlAnchorElem.click();
  };

  const importWorkflowJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed.nodes && parsed.connections) {
            pushStateToUndo();
            setNodes(parsed.nodes);
            setConnections(parsed.connections);
          }
        } catch (err) {}
      };
    }
  };

  // Drag Node Logic
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const targetNode = nodes.find(n => n.id === nodeId);
    if (!targetNode) return;

    const initialX = targetNode.x;
    const initialY = targetNode.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = (moveEvent.clientX - startX) / zoom;
      const dy = (moveEvent.clientY - startY) / zoom;

      setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, x: initialX + dx, y: initialY + dy } : n));
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const filteredCatalog = NODE_CATALOG.filter(item => {
    const matchesSearch = item.label.toLowerCase().includes(searchTerm.toLowerCase()) || item.desc.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || item.type === filterCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex h-[calc(100vh-100px)] gap-4 overflow-hidden">
      
      {/* Node Catalog Sidebar */}
      <div className="w-80 glass-panel p-4 rounded-2xl flex flex-col justify-between space-y-4 flex-shrink-0">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-wa-green" /> Node Library
            </h3>
            <span className="text-[10px] bg-wa-green/10 text-wa-green font-semibold px-2 py-0.5 rounded-full border border-wa-green/20">
              {filteredCatalog.length} Nodes
            </span>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search triggers, logic, actions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 outline-none focus:border-wa-green placeholder-slate-500"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
            {(['all', 'trigger', 'logic', 'action'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`flex-1 py-1 rounded-lg text-[10px] font-bold capitalize transition-all ${
                  filterCategory === cat ? 'bg-wa-green text-black shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Catalog List */}
          <div className="max-h-[calc(100vh-320px)] overflow-y-auto space-y-2 pr-1">
            {filteredCatalog.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.subtype}
                  onClick={() => addNodeToCanvas(item)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all hover:scale-[1.02] flex items-center gap-3 ${
                    item.type === 'trigger' ? 'bg-amber-500/10 border-amber-500/20 hover:border-amber-500/40' :
                    item.type === 'logic' ? 'bg-purple-500/10 border-purple-500/20 hover:border-purple-500/40' :
                    'bg-wa-green/10 border-wa-green/20 hover:border-wa-green/40'
                  }`}
                >
                  <div className={`p-2 rounded-lg flex-shrink-0 ${
                    item.type === 'trigger' ? 'bg-amber-500/20 text-amber-300' :
                    item.type === 'logic' ? 'bg-purple-500/20 text-purple-300' :
                    'bg-wa-green/20 text-wa-green'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-100">{item.label}</h4>
                    <p className="text-[10px] text-slate-400 line-clamp-1">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* JSON Import/Export */}
        <div className="pt-2 border-t border-white/10 flex gap-2">
          <label className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl py-2 text-xs font-semibold text-slate-300 flex items-center justify-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" /> Import JSON
            <input type="file" accept=".json" onChange={importWorkflowJSON} className="hidden" />
          </label>
          <button
            onClick={exportWorkflowJSON}
            className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl py-2 text-xs font-semibold text-slate-300 flex items-center justify-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Export JSON
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 glass-panel rounded-2xl flex flex-col relative overflow-hidden">
        
        {/* Top Workflow Action Bar */}
        <div className="p-4 border-b border-wa-green/10 flex items-center justify-between bg-bg-secondary/40 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={currentWorkflow?.name || ''}
              onChange={(e) => setCurrentWorkflow(prev => prev ? { ...prev, name: e.target.value } : null)}
              className="bg-transparent font-bold text-base text-slate-100 outline-none border-b border-transparent focus:border-wa-green"
            />
            <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30">
              v{currentWorkflow?.version || 1} Auto-Save
            </span>
          </div>

          <div className="flex items-center gap-2">
            {statusMsg && (
              <span className="text-xs text-wa-green font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> {statusMsg}
              </span>
            )}
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded-xl text-slate-300 text-xs flex items-center gap-1"
              title="Undo (Ctrl+Z)"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Undo
            </button>
            <button
              onClick={saveWorkflow}
              className="px-4 py-2 bg-wa-green hover:bg-wa-green-dark text-black font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg"
            >
              <Save className="w-4 h-4" /> Save & Deploy
            </button>
          </div>
        </div>

        {/* Canvas Surface */}
        <div
          ref={canvasRef}
          className="flex-1 relative overflow-hidden bg-[#070a11] cursor-grab active:cursor-grabbing"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(16,185,129,0.07) 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }}
        >
          {/* SVG Connection Cables */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
            {connections.map((conn) => {
              const sourceNode = nodes.find(n => n.id === conn.source);
              const targetNode = nodes.find(n => n.id === conn.target);
              if (!sourceNode || !targetNode) return null;

              const x1 = sourceNode.x + 200 + pan.x;
              const y1 = sourceNode.y + 40 + pan.y;
              const x2 = targetNode.x + pan.x;
              const y2 = targetNode.y + 40 + pan.y;
              const dx = (x2 - x1) * 0.5;

              const pathData = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
              const isIfTrue = conn.sourceHandle === 'true';
              const isIfFalse = conn.sourceHandle === 'false';

              return (
                <g key={conn.id}>
                  <path
                    d={pathData}
                    fill="none"
                    stroke={isIfTrue ? '#10b981' : isIfFalse ? '#ef4444' : '#a855f7'}
                    strokeWidth="3"
                    strokeDasharray={isIfFalse ? '5 5' : undefined}
                  />
                  <circle cx={x2} cy={y2} r="4" fill={isIfTrue ? '#10b981' : '#a855f7'} />
                </g>
              );
            })}
          </svg>

          {/* Render Nodes */}
          {nodes.map((node) => {
            const isSelected = selectedNode?.id === node.id;
            const isConnecting = connectingSourceId === node.id;

            return (
              <div
                key={node.id}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                onClick={() => handleNodeClick(node)}
                style={{
                  transform: `translate(${node.x + pan.x}px, ${node.y + pan.y}px)`,
                  position: 'absolute'
                }}
                className={`w-52 glass-panel rounded-2xl p-3 border shadow-2xl transition-all cursor-move z-10 select-none ${
                  isSelected ? 'border-wa-green ring-2 ring-wa-green/30' :
                  node.type === 'trigger' ? 'border-amber-500/30 bg-amber-950/20' :
                  node.type === 'logic' ? 'border-purple-500/30 bg-purple-950/20' :
                  'border-wa-green/20 bg-emerald-950/20'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                    node.type === 'trigger' ? 'bg-amber-500/20 text-amber-300' :
                    node.type === 'logic' ? 'bg-purple-500/20 text-purple-300' :
                    'bg-wa-green/20 text-wa-green'
                  }`}>
                    {node.type}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSelectedNode(node.id); }}
                    className="text-slate-500 hover:text-red-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <h4 className="text-xs font-bold text-slate-100">{node.label}</h4>
                <p className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                  {node.subtype === 'send_message' ? node.config.message || 'No msg configured' : node.subtype}
                </p>

                {/* Handles */}
                {node.subtype === 'if' ? (
                  <div className="mt-3 flex justify-between pt-2 border-t border-white/10">
                    <button
                      onClick={(e) => { e.stopPropagation(); setConnectingSourceId(node.id); setConnectingHandle('true'); }}
                      className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40 rounded text-[9px] font-bold"
                    >
                      True ➔
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConnectingSourceId(node.id); setConnectingHandle('false'); }}
                      className="px-2 py-0.5 bg-red-500/20 text-red-400 hover:bg-red-500/40 rounded text-[9px] font-bold"
                    >
                      False ➔
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConnectingSourceId(node.id); setConnectingHandle(null); }}
                    className={`mt-2 w-full py-1 rounded text-[9px] font-bold transition-all ${
                      isConnecting ? 'bg-wa-green text-black animate-pulse' : 'bg-white/5 hover:bg-white/15 text-slate-300'
                    }`}
                  >
                    {isConnecting ? 'Click Target Node...' : 'Connect Node ➔'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Node Inspector Config Sidebar */}
      {selectedNode && (
        <div className="w-80 glass-panel p-4 rounded-2xl flex flex-col justify-between space-y-4 flex-shrink-0 z-20">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                <Settings className="w-4 h-4 text-wa-green" /> Config Inspector
              </h3>
              <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Node Label</label>
                <input
                  type="text"
                  value={selectedNode.label}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedNode(prev => prev ? { ...prev, label: val } : null);
                    setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, label: val } : n));
                  }}
                  className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-wa-green mt-1"
                />
              </div>

              {selectedNode.subtype === 'send_message' && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Message Text</label>
                  <textarea
                    rows={4}
                    value={selectedNode.config.message || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const newConfig = { ...selectedNode.config, message: val };
                      setSelectedNode(prev => prev ? { ...prev, config: newConfig } : null);
                      setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, config: newConfig } : n));
                    }}
                    className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-wa-green mt-1"
                  />
                </div>
              )}

              {selectedNode.subtype === 'if' && (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Variable Path</label>
                    <input
                      type="text"
                      placeholder="e.g. trigger.text"
                      value={selectedNode.config.variable || 'trigger.text'}
                      onChange={(e) => {
                        const val = e.target.value;
                        const newConfig = { ...selectedNode.config, variable: val };
                        setSelectedNode(prev => prev ? { ...prev, config: newConfig } : null);
                        setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, config: newConfig } : n));
                      }}
                      className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-wa-green mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Comparison Value</label>
                    <input
                      type="text"
                      placeholder="e.g. help"
                      value={selectedNode.config.value || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const newConfig = { ...selectedNode.config, value: val };
                        setSelectedNode(prev => prev ? { ...prev, config: newConfig } : null);
                        setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, config: newConfig } : n));
                      }}
                      className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-wa-green mt-1"
                    />
                  </div>
                </div>
              )}

              {selectedNode.subtype === 'delay' && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Delay Seconds</label>
                  <input
                    type="number"
                    value={selectedNode.config.seconds || 3}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      const newConfig = { ...selectedNode.config, seconds: val };
                      setSelectedNode(prev => prev ? { ...prev, config: newConfig } : null);
                      setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, config: newConfig } : n));
                    }}
                    className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-wa-green mt-1"
                  />
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => deleteSelectedNode(selectedNode.id)}
            className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" /> Delete Node
          </button>
        </div>
      )}
    </div>
  );
}
