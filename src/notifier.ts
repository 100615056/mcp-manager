import notifier from 'node-notifier';

export function notify(
  title: string,
  message: string,
  onClick?: () => void,
): void {
  notifier.notify(
    {
      title,
      message,
      sound: false,
      wait: !!onClick,
    },
    onClick ? (_err, _response, metadata) => {
      if (metadata?.activationValue === 'clicked') onClick();
    } : undefined,
  );
}

export function notifyDrop(serverName: string, onRestart: () => void): void {
  notify(
    'MCP Server Disconnected',
    `${serverName} disconnected — click to restart`,
    onRestart,
  );
}

export function notifyReconnect(serverName: string): void {
  notify('MCP Server Reconnected', `${serverName} reconnected`);
}

export function notifyFailed(serverName: string): void {
  notify('MCP Server Failed', `${serverName} failed to restart — check config`);
}

export function notifyDegraded(serverName: string, ms: number): void {
  notify('MCP Server Slow', `${serverName} responding slowly (${ms}ms)`);
}
