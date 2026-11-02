import type {
  ConsoleTransport,
  herdr,
  MethodResult,
  ParamsOf,
  PingInfo,
  WireMethod,
} from '@openagentspocket/core';

/**
 * The herdr API surface the app calls, each one request through `request`. Wire params keep
 * herdr's snake_case (the generated types); results are unwrapped to the entity they carry.
 */
export abstract class HerdrApi implements ConsoleTransport {
  /** One herdr request: encode, exchange, decode against the method's result tag. */
  abstract request<M extends WireMethod>(method: M, params?: ParamsOf<M>): Promise<MethodResult<M>>;

  async ping(): Promise<PingInfo> {
    const pong = await this.request('ping');
    return { version: pong.version, protocolVersion: pong.protocol };
  }

  async listAgents(): Promise<herdr.AgentInfo[]> {
    return (await this.request('agent.list')).agents;
  }

  async agentInfo(params: ParamsOf<'agent.get'>): Promise<herdr.AgentInfo> {
    return (await this.request('agent.get', params)).agent;
  }

  async paneProcessInfo(paneId: string): Promise<herdr.PaneProcessInfo> {
    return (await this.request('pane.process_info', { pane_id: paneId })).process_info;
  }

  async sessionSnapshot(): Promise<herdr.SessionSnapshot> {
    return (await this.request('session.snapshot')).snapshot;
  }

  /** The recent text of a pane, as the Console reads it. */
  async readPane(params: {
    paneId: string;
    source: 'recent';
    lines: number;
    stripAnsi: boolean;
  }): Promise<{ text: string }> {
    return this.readPaneWith({
      pane_id: params.paneId,
      source: params.source,
      lines: params.lines,
      strip_ansi: params.stripAnsi,
    });
  }

  async readPaneWith(params: ParamsOf<'pane.read'>): Promise<herdr.PaneReadResult> {
    return (await this.request('pane.read', params)).read;
  }

  async readAgent(params: ParamsOf<'agent.read'>): Promise<herdr.PaneReadResult> {
    return (await this.request('agent.read', params)).read;
  }

  async promptAgent(params: ParamsOf<'agent.prompt'>): Promise<herdr.AgentInfo> {
    return (await this.request('agent.prompt', params)).agent;
  }

  async sendAgentKeys(params: ParamsOf<'agent.send_keys'>): Promise<void> {
    await this.request('agent.send_keys', params);
  }

  async sendPaneInput(params: ParamsOf<'pane.send_input'>): Promise<void> {
    await this.request('pane.send_input', params);
  }

  /** The reply is `tab_info` (probed live); callers treat a rename as cosmetic. */
  async renameTab(params: ParamsOf<'tab.rename'>): Promise<void> {
    await this.request('tab.rename', params);
  }

  async closePane(paneId: string): Promise<void> {
    await this.request('pane.close', { pane_id: paneId });
  }

  /** herdr closes the workspace itself when this was its last tab. */
  async closeTab(tabId: string): Promise<void> {
    await this.request('tab.close', { tab_id: tabId });
  }

  async focusAgent(params: ParamsOf<'agent.focus'>): Promise<void> {
    await this.request('agent.focus', params);
  }

  async renameAgent(params: ParamsOf<'agent.rename'>): Promise<void> {
    await this.request('agent.rename', params);
  }

  async renameWorkspace(params: ParamsOf<'workspace.rename'>): Promise<void> {
    await this.request('workspace.rename', params);
  }

  async closeWorkspace(workspaceId: string): Promise<void> {
    await this.request('workspace.close', { workspace_id: workspaceId });
  }

  async listWorktrees(workspaceId: string): Promise<MethodResult<'worktree.list'>> {
    return this.request('worktree.list', { workspace_id: workspaceId });
  }

  async removeWorktree(
    params: ParamsOf<'worktree.remove'>,
  ): Promise<MethodResult<'worktree.remove'>> {
    return this.request('worktree.remove', params);
  }

  async createTab(params: ParamsOf<'tab.create'>): Promise<MethodResult<'tab.create'>> {
    return this.request('tab.create', params);
  }

  async createWorkspace(
    params: ParamsOf<'workspace.create'>,
  ): Promise<MethodResult<'workspace.create'>> {
    return this.request('workspace.create', params);
  }

  async createWorktree(
    params: ParamsOf<'worktree.create'>,
  ): Promise<MethodResult<'worktree.create'>> {
    return this.request('worktree.create', params);
  }

  async startAgentIn(params: ParamsOf<'agent.start'>): Promise<MethodResult<'agent.start'>> {
    return this.request('agent.start', params);
  }
}
