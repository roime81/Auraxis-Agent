import type { ToolCall } from './tools';
import {
  BUILT_IN_MODELS as SHARED_MODELS,
  modelSupportsImageInput as sharedModelSupportsImageInput,
  type ModelDefinition,
  type ModelProvider,
} from '../../electron/types';
import type { ApiMessageContent } from '../../electron/types';
import type { PermissionRequest, DeepSeekToolChoice, WorkAutonomyTier } from './advanced';
import type { BrowserAnnotation } from './browser';
import type { WorkbenchPanelKey } from '../workbench/workbench-panels';

export interface DesktopOrbState {
  enabled: boolean;
  visible: boolean;
  alwaysOnTop: boolean;
  pinned: boolean;
  minimized: boolean;
  width: number;
  height: number;
  x: number;
  y: number;
  lastActivatedAt: number | null;
}

export interface DesktopWindowState {
  width: number;
  height: number;
  x: number;
  y: number;
  maximized: boolean;
  minimized: boolean;
  closeAction: 'minimize' | 'quit';
}

export interface DesktopPageTargetState {
  url: string | null;
  title: string | null;
  source: 'agent' | 'user' | null;
  visible: boolean;
  lastOpenedAt: number | null;
}

export interface DesktopLayoutState {
  orb: DesktopOrbState;
  window: DesktopWindowState;
  page: DesktopPageTargetState;
}

/**
 * 右侧栏可显示的功能视图（'menu' 是清单态，'none' 表示面板关闭）。
 * 功能键来自 Panel Registry（src/workbench/workbench-panels.tsx）。
 */
export type RightPanelTab = 'menu' | 'none' | WorkbenchPanelKey;
export type AIModel = ModelDefinition;
export type { ModelProvider };
// 旧模型名 → 当前规范名：渲染层显示模型名时统一走它，避免旧 id 漏到界面上。
export { resolveModelId } from '../../electron/contracts/core';
