import notifier from 'node-notifier';
export function notify(title, message, onClick) {
    notifier.notify({
        title,
        message,
        sound: false,
        wait: !!onClick,
    }, onClick ? (_err, _response, metadata) => {
        if (metadata?.activationValue === 'clicked')
            onClick();
    } : undefined);
}
export function notifyDrop(serverName, onRestart) {
    notify('MCP Server Disconnected', `${serverName} disconnected — click to restart`, onRestart);
}
export function notifyReconnect(serverName) {
    notify('MCP Server Reconnected', `${serverName} reconnected`);
}
export function notifyFailed(serverName) {
    notify('MCP Server Failed', `${serverName} failed to restart — check config`);
}
export function notifyDegraded(serverName, ms) {
    notify('MCP Server Slow', `${serverName} responding slowly (${ms}ms)`);
}
//# sourceMappingURL=notifier.js.map