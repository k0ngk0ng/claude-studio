import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';

interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
}

interface McpServerProcess {
  id: string;
  name: string;
  process: ChildProcess;
  startTime: number;
}

// Debug log helper
function debugLog(...args: unknown[]) {
  console.log('[mcp-manager]', ...args);
}

class McpManager {
  private runningServers: Map<string, McpServerProcess> = new Map();

  /**
   * Get list of configured (enabled) MCP servers
   */
  getConfiguredServers(servers: McpServerConfig[]): McpServerConfig[] {
    return servers.filter((s) => s.enabled);
  }

  /**
   * Start an MCP server process (for debugging purposes)
   * Note: Claude Code SDK starts these automatically, but we keep this
   * for debugging and status tracking
   */
  startServer(server: McpServerConfig): string | null {
    if (this.runningServers.has(server.id)) {
      debugLog(`Server ${server.name} already running`);
      return server.id;
    }

    try {
      debugLog(`Starting MCP server: ${server.name}`);
      debugLog(`  command: ${server.command} ${server.args.join(' ')}`);

      const child = spawn(server.command, server.args, {
        env: { ...process.env, ...server.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const serverId = randomUUID();

      child.stdout?.on('data', (data) => {
        debugLog(`[${server.name}] stdout:`, data.toString().slice(0, 200));
      });

      child.stderr?.on('data', (data) => {
        debugLog(`[${server.name}] stderr:`, data.toString().slice(0, 200));
      });

      child.on('error', (err) => {
        debugLog(`[${server.name}] error:`, err.message);
      });

      child.on('exit', (code, signal) => {
        debugLog(`[${server.name}] exited with code ${code}, signal ${signal}`);
        this.runningServers.delete(server.id);
      });

      this.runningServers.set(server.id, {
        id: server.id,
        name: server.name,
        process: child,
        startTime: Date.now(),
      });

      debugLog(`Started MCP server: ${server.name} (id: ${server.id})`);
      return server.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      debugLog(`Failed to start MCP server ${server.name}:`, msg);
      return null;
    }
  }

  /**
   * Stop an MCP server
   */
  stopServer(serverId: string): boolean {
    const server = this.runningServers.get(serverId);
    if (!server) {
      debugLog(`Server ${serverId} not running`);
      return false;
    }

    server.process.kill();
    this.runningServers.delete(serverId);
    debugLog(`Stopped MCP server: ${server.name}`);
    return true;
  }

  /**
   * Stop all MCP servers
   */
  stopAll(): void {
    for (const [id, server] of this.runningServers) {
      server.process.kill();
      debugLog(`Stopped MCP server: ${server.name}`);
    }
    this.runningServers.clear();
    debugLog('All MCP servers stopped');
  }

  /**
   * Get running servers info
   */
  getRunningServers(): Array<{ id: string; name: string; uptime: number }> {
    const now = Date.now();
    return Array.from(this.runningServers.values()).map((s) => ({
      id: s.id,
      name: s.name,
      uptime: now - s.startTime,
    }));
  }
}

export const mcpManager = new McpManager();
