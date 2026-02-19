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
  private mcpConfigPath: string | null = null;

  /**
   * Write MCP servers config to project's mcp.json file
   * Returns the path to the config file
   */
  writeMcpConfig(cwd: string, servers: McpServerConfig[]): string | null {
    const mcpConfigPath = path.join(cwd, 'mcp.json');

    try {
      // Filter only enabled servers
      const enabledServers = servers.filter((s) => s.enabled);

      if (enabledServers.length === 0) {
        // If no enabled servers, write an empty mcpServers object to override global config
        // (don't delete the file - that would cause Claude Code to fall back to global ~/.claude/mcp.json)
        const emptyConfig = { mcpServers: {} };
        fs.writeFileSync(mcpConfigPath, JSON.stringify(emptyConfig, null, 2), 'utf-8');
        this.mcpConfigPath = mcpConfigPath;
        debugLog('Written empty mcp.json to override global config:', mcpConfigPath);
        return mcpConfigPath;
      }

      // Build mcp.json content in Claude Code format
      const mcpConfig: Record<string, unknown> = {
        mcpServers: {},
      };

      for (const server of enabledServers) {
        (mcpConfig.mcpServers as Record<string, unknown>)[server.name] = {
          command: server.command,
          args: server.args,
          env: server.env,
        };
      }

      // Write to file
      fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');
      this.mcpConfigPath = mcpConfigPath;

      debugLog('Written mcp.json:', mcpConfigPath);
      debugLog('MCP servers configured:', enabledServers.map((s) => s.name).join(', '));

      return mcpConfigPath;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      debugLog('Failed to write mcp.json:', msg);
      return null;
    }
  }

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

  /**
   * Get MCP config path for current project
   */
  getMcpConfigPath(): string | null {
    return this.mcpConfigPath;
  }
}

export const mcpManager = new McpManager();
