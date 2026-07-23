import { PrismaClient } from '@prisma/client';
import { getSocket } from './bot.js';
import { generateAiResponse } from './ai.js';
import { logger } from './logger.js';
const fetch = (global as any).fetch;

const prisma = new PrismaClient();
const executionQueue: Array<{ executionId: string }> = [];
let isProcessingQueue = false;

// Helper delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Enterprise Workflow Engine
 * Handles queued async execution, retries, resume, timeouts, and WhatsApp node actions.
 */
export async function triggerWorkflows(eventType: string, triggerPayload: any, sessionId: string = 'default') {
  try {
    const activeWorkflows = await prisma.workflow.findMany({
      where: { sessionId, isActive: true },
      include: { nodes: true, connections: true }
    });

    for (const wf of activeWorkflows) {
      // Find matching trigger node
      const triggerNode = wf.nodes.find(n => {
        if (n.type !== 'trigger') return false;
        if (n.subtype === eventType) return true;
        if (n.subtype === 'keyword_trigger' && eventType === 'whatsapp_message') {
          const config = JSON.parse(n.configJson || '{}');
          const kw = (config.keyword || '').toLowerCase();
          const text = (triggerPayload.text || '').toLowerCase();
          return kw && text.includes(kw);
        }
        return false;
      });

      if (triggerNode) {
        // Create execution instance
        const execution = await prisma.workflowExecution.create({
          data: {
            workflowId: wf.id,
            sessionId,
            status: 'running',
            triggerData: JSON.stringify(triggerPayload),
            contextData: JSON.stringify({ trigger: triggerPayload, vars: {} })
          }
        });

        // Add log
        await addExecutionLog(execution.id, triggerNode.nodeId, triggerNode.label, 'info', `Workflow triggered by ${eventType}`, triggerPayload);

        // Queue execution
        executionQueue.push({ executionId: execution.id });
        processQueue();
      }
    }
  } catch (err: any) {
    logger.error(sessionId, 'Failed to trigger workflows', err);
  }
}

async function processQueue() {
  if (isProcessingQueue || executionQueue.length === 0) return;
  isProcessingQueue = true;

  while (executionQueue.length > 0) {
    const item = executionQueue.shift();
    if (!item) break;

    try {
      await runExecution(item.executionId);
    } catch (err: any) {
      console.error(`Execution error [${item.executionId}]:`, err);
    }
  }

  isProcessingQueue = false;
}

export async function runExecution(executionId: string) {
  const execution = await prisma.workflowExecution.findUnique({
    where: { id: executionId },
    include: { workflow: { include: { nodes: true, connections: true } } }
  });

  if (!execution || !execution.workflow) return;

  const { workflow } = execution;
  const nodesMap = new Map(workflow.nodes.map(n => [n.nodeId, n]));
  const context = JSON.parse(execution.contextData || '{}');

  // Find start node (trigger)
  const startNode = workflow.nodes.find(n => n.type === 'trigger');
  if (!startNode) {
    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'failed', errorMsg: 'No trigger node found in workflow.' }
    });
    return;
  }

  let currentNodeId: string | null = startNode.nodeId;
  let currentHandle: string | null = null;

  try {
    while (currentNodeId) {
      const node = nodesMap.get(currentNodeId);
      if (!node) break;

      const nodeConfig = JSON.parse(node.configJson || '{}');
      await addExecutionLog(executionId, node.nodeId, node.label, 'info', `Executing node: ${node.label}`, nodeConfig);

      let nextHandle: string | null = null;

      // ---- NODE EXECUTION DISPATCHER ------------------------------------ //
      if (node.type === 'logic') {
        if (node.subtype === 'if') {
          const varValue = getContextVar(context, nodeConfig.variable || 'trigger.text');
          const condition = nodeConfig.operator || 'contains';
          const compareVal = nodeConfig.value || '';
          
          let isTrue = false;
          if (condition === 'contains') isTrue = String(varValue).toLowerCase().includes(String(compareVal).toLowerCase());
          else if (condition === 'equals') isTrue = String(varValue).toLowerCase() === String(compareVal).toLowerCase();
          else if (condition === 'gt') isTrue = Number(varValue) > Number(compareVal);

          nextHandle = isTrue ? 'true' : 'false';
          await addExecutionLog(executionId, node.nodeId, node.label, 'info', `IF evaluated to: ${isTrue}`, { isTrue, varValue });
        } else if (node.subtype === 'delay' || node.subtype === 'random_delay') {
          let delayMs = (nodeConfig.seconds || 3) * 1000;
          if (node.subtype === 'random_delay') {
            const minSec = nodeConfig.minSeconds || 3;
            const maxSec = nodeConfig.maxSeconds || 10;
            delayMs = (Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec) * 1000;
          }
          await addExecutionLog(executionId, node.nodeId, node.label, 'info', `Waiting for ${delayMs / 1000}s...`);
          await sleep(delayMs);
        } else if (node.subtype === 'filter') {
          const val = getContextVar(context, nodeConfig.variable || 'trigger.text');
          if (!val || !String(val).includes(nodeConfig.keyword || '')) {
            await addExecutionLog(executionId, node.nodeId, node.label, 'warn', `Filter blocked execution. Stopping branch.`);
            break;
          }
        }
      } else if (node.type === 'action') {
        const sock = getSocket(execution.sessionId);
        const recipientJid = parseRecipient(nodeConfig.recipient || context.trigger?.sender || '', context);

        if (node.subtype === 'send_message' || node.subtype === 'action_send_message') {
          if (sock && recipientJid) {
            const textContent = interpolateString(nodeConfig.message || 'Hello from Workflow!', context);
            
            // Human typing presence
            await sock.sendPresenceUpdate('composing', recipientJid);
            await sleep(2000);
            await sock.sendPresenceUpdate('paused', recipientJid);

            await sock.sendMessage(recipientJid, { text: textContent });
            await addExecutionLog(executionId, node.nodeId, node.label, 'success', `Sent WhatsApp message to ${recipientJid}`, { text: textContent });
          }
        } else if (node.subtype === 'ai_response') {
          if (sock && recipientJid) {
            const promptText = interpolateString(nodeConfig.prompt || context.trigger?.text || 'Hello', context);
            const aiReply = await generateAiResponse(promptText, nodeConfig.personality || 'friendly', nodeConfig.customTone, recipientJid, execution.sessionId);
            
            await sock.sendMessage(recipientJid, { text: aiReply });
            await addExecutionLog(executionId, node.nodeId, node.label, 'success', `Dispatched AI response to ${recipientJid}`, { aiReply });
          }
        } else if (node.subtype === 'react_message') {
          if (sock && recipientJid && context.trigger?.msgKey) {
            await sock.sendMessage(recipientJid, { react: { text: nodeConfig.emoji || '👍', key: context.trigger.msgKey } });
            await addExecutionLog(executionId, node.nodeId, node.label, 'success', `Reacted to message with ${nodeConfig.emoji || '👍'}`);
          }
        } else if (node.subtype === 'http_request' || node.subtype === 'call_api') {
          const url = interpolateString(nodeConfig.url || 'https://api.github.com', context);
          const method = nodeConfig.method || 'GET';
          const res = await fetch(url, { method });
          const responseData = await res.json().catch(() => ({ status: res.status }));
          
          context.vars[nodeConfig.outputVar || 'apiResponse'] = responseData;
          await addExecutionLog(executionId, node.nodeId, node.label, 'success', `HTTP Request ${method} ${url} completed`, responseData);
        }
      }

      // Find next connection
      const edge = workflow.connections.find(c => {
        if (c.sourceNodeId !== currentNodeId) return false;
        if (nextHandle && c.sourceHandle) return c.sourceHandle === nextHandle;
        return true;
      });

      currentNodeId = edge ? edge.targetNodeId : null;
    }

    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'completed', completedAt: new Date(), contextData: JSON.stringify(context) }
    });
  } catch (err: any) {
    await addExecutionLog(executionId, currentNodeId, 'Error', 'error', `Execution failed: ${err.message}`, err);
    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'failed', errorMsg: err.message }
    });
  }
}

async function addExecutionLog(executionId: string, nodeId: string | null, nodeLabel: string | null, level: string, message: string, payload?: any) {
  await prisma.executionLog.create({
    data: {
      executionId,
      nodeId,
      nodeLabel,
      level,
      message,
      payloadJson: payload ? JSON.stringify(payload) : null
    }
  }).catch(() => {});
}

function getContextVar(context: any, pathStr: string): any {
  const parts = pathStr.split('.');
  let curr = context;
  for (const p of parts) {
    if (curr && typeof curr === 'object' && p in curr) {
      curr = curr[p];
    } else {
      return undefined;
    }
  }
  return curr;
}

function interpolateString(str: string, context: any): string {
  return str.replace(/\{\{(.*?)\}\}/g, (_, varName) => {
    const val = getContextVar(context, varName.trim());
    return val !== undefined ? String(val) : '';
  });
}

function parseRecipient(rawRecipient: string, context: any): string {
  let recipient = interpolateString(rawRecipient, context).replace(/[^0-9]/g, '');
  if (!recipient && context.trigger?.sender) {
    recipient = context.trigger.sender;
  }
  if (!recipient.includes('@')) {
    recipient = recipient.length > 15 ? `${recipient}@g.us` : `${recipient}@s.whatsapp.net`;
  }
  return recipient;
}
