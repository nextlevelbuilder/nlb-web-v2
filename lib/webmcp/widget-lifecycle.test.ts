import { afterEach, describe, expect, it, vi } from 'vitest';
import WebMCP from './vendor/webmcp';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('vendored widget cleanup', () => {
  it('removes listeners, timers, sockets, saved connection and registries', () => {
    vi.useFakeTimers();
    const remove = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal('document', { getElementById: () => ({ remove }), removeEventListener });
    const removeItem = vi.fn();
    vi.stubGlobal('sessionStorage', { removeItem });
    // Exercise the actual destroy/disconnect methods without needing the presentation DOM.
    const widget = Object.create(WebMCP.prototype);
    const socket = { close: vi.fn() };
    const registration = { close: vi.fn() };
    const activityHandler = vi.fn();
    Object.assign(widget, {
      destroyed: false, connectionGeneration: 0, socket, registrationSocket: registration,
      pendingSockets: new Set([socket, registration]), activityHandler,
      inactivityTimer: setTimeout(() => {}, 1000), elementId: 'widget',
      availableTools: new Map([['draft', {}]]), availablePrompts: new Map(),
      availableResources: new Map(), samplingCallbacks: new Map(),
      SESSION_STORAGE_KEY: 'webmcp_token', TOOLS_STORAGE_KEY: 'webmcp_tools',
      PROMPTS_STORAGE_KEY: 'webmcp_prompts', RESOURCES_STORAGE_KEY: 'webmcp_resources',
      _updateStatus: vi.fn(), _updateConnectionUI: vi.fn(),
    });
    widget.destroy();
    widget.destroy();
    expect(widget.destroyed).toBe(true);
    expect(socket.close).toHaveBeenCalled();
    expect(registration.close).toHaveBeenCalled();
    expect(widget.pendingSockets.size).toBe(0);
    expect(widget.availableTools.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledOnce();
    expect(removeEventListener.mock.calls).toEqual(['mousemove', 'keypress', 'click', 'scroll'].map((event) => [event, activityHandler]));
    expect(removeItem).toHaveBeenCalledWith('webmcp_token');
  });

  it('does not execute a queued tool after disconnect', () => {
    const widget = Object.create(WebMCP.prototype);
    const call = vi.fn();
    Object.assign(widget, { destroyed: false, isConnected: false, _handleToolCall: call });
    widget._handleServerMessage({ type: 'callTool', tool: 'studio_replace_draft' });
    expect(call).not.toHaveBeenCalled();
  });

  it('does not reconnect after an in-flight registration resolves after disconnect', async () => {
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: vi.fn() });
    vi.stubGlobal('window', { location: { host: 'localhost:3000' } });
    const webSocket = vi.fn();
    vi.stubGlobal('WebSocket', webSocket);
    const widget = Object.create(WebMCP.prototype);
    let resolve!: (value: { token: string }) => void;
    Object.assign(widget, {
      destroyed: false, connectionGeneration: 0, _updateStatus: vi.fn(),
      _processConnectionToken: () => true,
      _registerWithServer: () => new Promise((done) => { resolve = done; }),
    });
    const connection = widget.connect('user-supplied-token');
    widget.connectionGeneration++;
    resolve({ token: 'session-token' });
    await connection;
    expect(webSocket).not.toHaveBeenCalled();
  });
});
