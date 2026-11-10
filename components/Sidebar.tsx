import React, { useRef, useState } from 'react';
import { Upload, FileJson, Save, RefreshCw, Trash2, ArrowLeft, Sparkles, HelpCircle } from 'lucide-react';
import { AppState } from '../types';
import { VERSION } from '../constants';
import { LaTeXCheatsheet } from './LaTeXCheatsheet';

interface SidebarProps {
  state: AppState;
  onLoadAssignment: (file: File) => void | Promise<void>;
  onLoadDemo: () => void;
  onLoadWork: (file: File) => void;
  onExportWork: () => void;
  onClearWork: () => void;
  onToggleView: () => void;
  onDownloadForGradescope: () => void;
  statusMessage: string;
}

const Sidebar: React.FC<SidebarProps> = ({
  state,
  onLoadAssignment,
  onLoadDemo,
  onLoadWork,
  onExportWork,
  onClearWork,
  onToggleView,
  onDownloadForGradescope,
  statusMessage
}) => {
  const assignmentInputRef = useRef<HTMLInputElement>(null);
  const workInputRef = useRef<HTMLInputElement>(null);
  const [showLatexHelp, setShowLatexHelp] = useState(false);

  const handleAssignmentClick = () => assignmentInputRef.current?.click();
  const handleWorkClick = () => workInputRef.current?.click();

  // `h-full` and the internal scroll only apply once the sidebar is a
  // viewport-height column beside the content (lg and up). Stacked above the
  // content on a phone it sizes to its own content and scrolls with the page.
  return (
    <div className="w-full lg:w-[320px] lg:flex-shrink-0 bg-aggie-600 text-aggie-50 flex flex-col lg:h-full lg:overflow-y-auto shadow-2xl z-20">
      <div className="p-6 bg-aggie-500">
        <div className="flex items-center gap-3 mb-2">
          <div>
            <h1 className="text-lg font-extrabold text-gold-500">BridgeSuite</h1>
            <div className="text-xs text-aggie-200">Student Submission</div>
          </div>
        </div>
        <div className="text-[10px] text-aggie-200 mt-1 font-mono">{VERSION}</div>
      </div>

      <div className="p-6 space-y-8 flex-1">
        
        {/* Assignment Section - Step 1 */}
        {/*
          There is no "Student Info" step above this any more (2026-09-03).
          Identity comes from the authenticated submitter, so the app does not
          ask, and nothing here is gated behind a text field: the first step is
          now something the student can actually do, and it is available the
          moment the page loads.

          CORRECTED 2026-10-19. This said Gradescope. The student uploads the
          suitcase to CANVAS, and the relay downloads it from there against the
          roster, so Canvas is what knows who submitted
          (ROUTE_ASSIGNMENTS_P3P2_2026-10-19.md, step 3). Comment only; no
          student ever saw the word.
        */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center ${state.assignment ? 'bg-green-500 text-white' : 'bg-aggie-500 text-white animate-pulse'}`}>1</span>
            <h3 className="text-xs font-bold text-aggie-200 uppercase tracking-widest">Assignment</h3>
            {state.assignment && <span className="text-green-400 text-xs">Loaded</span>}
          </div>

          {!state.assignment ? (
            <div className="space-y-3">
              <button
                onClick={handleAssignmentClick}
                className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-aggie-600 rounded-lg hover:border-aggie-500 hover:bg-aggie-800 transition-all text-aggie-50 group"
              >
                <Upload className="w-5 h-5 group-hover:text-aggie-400" />
                <span className="text-sm font-medium">Upload assignment</span>
              </button>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-aggie-700"></div>
                <span className="text-xs text-aggie-200">or</span>
                <div className="flex-1 h-px bg-aggie-700"></div>
              </div>

              <button
                onClick={onLoadDemo}
                className="w-full flex items-center justify-center gap-2 p-3 bg-gold-500 hover:bg-gold-400 rounded-md font-bold transition-all text-aggie-900 group"
              >
                <Sparkles className="w-4 h-4" />
                <span className="text-sm font-medium">Try Demo Assignment</span>
              </button>
              <p className="text-[10px] text-aggie-200 text-center">
                No file needed - explore all features instantly
              </p>
            </div>
          ) : (
             <div className="bg-aggie-500 rounded-xl p-5 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                 <span className="bg-green-900 text-green-300 text-[10px] px-2 py-0.5 rounded border border-green-800">Loaded</span>
                 <button onClick={handleAssignmentClick} className="text-xs text-aggie-400 hover:text-aggie-300 hover:underline">Change</button>
              </div>
              <h4 className="font-bold text-white text-sm mb-1">{state.assignment.courseCode}</h4>
              <p className="text-xs text-aggie-50 line-clamp-2">{state.assignment.title}</p>
              <div className="mt-3 pt-3 border-t border-aggie-700 text-xs flex justify-between text-aggie-200">
                 <span>{state.assignment.problems.length} Problems</span>
                 <span>{state.assignment.problems.reduce((sum, p) => sum + p.subsections.reduce((s, sub) => s + sub.points, 0), 0)} Pts</span>
              </div>
             </div>
          )}
          {/* The student is given a zip — the `student/` folder of the
              instructor's export, the same file they printed the PDF from. A
              bare assignment_spec.json still loads, so both are accepted. */}
          <input type="file" ref={assignmentInputRef} onChange={(e) => e.target.files?.[0] && void onLoadAssignment(e.target.files[0])} accept=".zip,.json,application/zip,application/json" className="hidden" />
        </div>

        {/* Actions */}
        <div className="space-y-4">
           <h3 className="text-xs font-bold text-aggie-200 uppercase tracking-widest">Data Management</h3>
           <div className="grid grid-cols-2 gap-2">
             <button onClick={onExportWork} disabled={!state.assignment} className="flex items-center justify-center gap-2 bg-aggie-900 hover:bg-aggie-800 p-2 rounded-md font-semibold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-aggie-50">
                <Save className="w-4 h-4" /> Save Backup
             </button>
             <button onClick={handleWorkClick} className="flex items-center justify-center gap-2 bg-aggie-900 hover:bg-aggie-800 p-2 rounded-md font-semibold text-xs transition-colors text-aggie-50">
                <FileJson className="w-4 h-4" /> Load Work
             </button>
           </div>
           <input type="file" ref={workInputRef} onChange={(e) => e.target.files?.[0] && onLoadWork(e.target.files[0])} accept=".json" className="hidden" />
           
           <button onClick={onClearWork} className="w-full flex items-center justify-center gap-2 text-red-400 hover:bg-red-950/30 hover:text-red-300 p-2 rounded border border-transparent hover:border-red-900 transition-colors text-xs">
              <Trash2 className="w-4 h-4" /> Clear All Data
           </button>
        </div>

        {/* LaTeX Equation Help */}
        <div className="pt-4 border-t border-aggie-700">
           <button
              onClick={() => setShowLatexHelp(true)}
              className="w-full flex items-center justify-center gap-2 bg-aggie-900 hover:bg-aggie-800 p-3 rounded-md font-semibold text-sm transition-colors text-aggie-50"
            >
              <HelpCircle className="w-4 h-4 text-aggie-400" /> Math Equation Format Help
           </button>
           <p className="text-[10px] text-aggie-200 text-center mt-1">
             Use LaTeX notation for mathematical equations
           </p>
        </div>

        {/* Back to Edit (only shown in print mode) */}
        {state.viewMode === 'print' && (
          <div className="pt-4 border-t border-aggie-700">
            <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-3 mb-3">
              <p className="text-sm text-green-300 text-center">
                <strong>Preview Mode</strong>
              </p>
            </div>
            <button
              onClick={onToggleView}
              className="w-full py-2 px-4 bg-aggie-700 hover:bg-aggie-600 text-white rounded font-medium flex items-center justify-center gap-2 transition-all text-sm"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Edit
            </button>
          </div>
        )}
      </div>

      {/* Footer Status */}
      <div className="p-4 bg-aggie-900 border-t border-aggie-800 text-[10px] text-aggie-200 flex justify-between items-center">
        <div className="flex items-center gap-2">
           {statusMessage ? (
             <span className="text-aggie-400 animate-pulse">{statusMessage}</span>
           ) : state.lastSaved ? (
             <span className="text-green-500 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Saved {new Date(state.lastSaved).toLocaleTimeString()}</span>
           ) : (
             <span>Ready</span>
           )}
        </div>
      </div>

      {/* LaTeX Cheatsheet Modal */}
      <LaTeXCheatsheet isOpen={showLatexHelp} onClose={() => setShowLatexHelp(false)} />
    </div>
  );
};

export default Sidebar;