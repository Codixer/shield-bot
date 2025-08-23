import { DiscordSDK } from '@discord/embedded-app-sdk';

// Types
interface Squad {
  id: string;
  name: string;
  number?: string;
}

interface EventSummary {
  id: number;
  host?: { discordId: string };
  cohost?: { discordId: string };
  staff?: Array<{ user: { discordId: string } }>;
  squads?: Array<{
    name: string;
    members: Array<{
      user: { discordId: string };
      isLead: boolean;
      isLate: boolean;
      lateNote?: string;
      isSplit: boolean;
      splitFrom?: string;
    }>;
  }>;
}

// Global state
let discordSdk: DiscordSDK;
let accessToken: string;
let instanceId: string;
let currentUser: any;
let squads: Squad[] = [];

// DOM elements
const statusEl = document.getElementById('status')!;
const loadingEl = document.getElementById('loading')!;
const mainContentEl = document.getElementById('main-content')!;
const errorContainer = document.getElementById('error-container')!;
const successContainer = document.getElementById('success-container')!;
const squadSelect = document.getElementById('squadSelect') as HTMLSelectElement;
const eventSummaryEl = document.getElementById('event-summary')!;
const formattedTextEl = document.getElementById('formatted-text')!;

// Initialize Discord SDK
async function initializeDiscordSDK() {
  try {
    // Get client ID from environment or URL
    const clientId = '1234567890123456789'; // Replace with your actual client ID
    
    discordSdk = new DiscordSDK(clientId);
    await discordSdk.ready();
    
    instanceId = discordSdk.instanceId;
    
    statusEl.textContent = 'Authenticating...';
    
    // Authorize and authenticate
    const { code } = await discordSdk.commands.authorize({
      client_id: clientId,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify', 'guilds.members.read'],
    });

    // Exchange code for access token (this would normally be done on your server)
    const tokenResponse = await fetch('/api/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });
    
    const tokenData = await tokenResponse.json();
    accessToken = tokenData.access_token;

    // Authenticate with Discord client
    const auth = await discordSdk.commands.authenticate({
      access_token: accessToken,
    });
    
    currentUser = auth.user;
    
    statusEl.textContent = `Connected as ${currentUser.username}`;
    
    // Load squads
    await loadSquads();
    
    // Initialize or load existing event
    await initializeEvent();
    
    // Show main content
    loadingEl.style.display = 'none';
    mainContentEl.style.display = 'block';
    
    // Initial summary load
    await refreshSummary();
    
  } catch (error) {
    console.error('Failed to initialize Discord SDK:', error);
    showError(`Failed to connect to Discord: ${error}`);
    loadingEl.style.display = 'none';
  }
}

// API helper functions
async function apiCall(endpoint: string, method: string = 'GET', body?: any) {
  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  };
  
  if (body && method !== 'GET') {
    options.body = JSON.stringify({ ...body, discordInstanceId: instanceId });
  }
  
  const url = method === 'GET' && body 
    ? `${endpoint}?${new URLSearchParams({ ...body, discordInstanceId: instanceId }).toString()}`
    : endpoint;
  
  const response = await fetch(url, options);
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'API request failed');
  }
  
  return data;
}

// Load available squads
async function loadSquads() {
  try {
    const response = await fetch('/api/attendance/squads');
    const data = await response.json();
    
    if (data.success) {
      squads = data.squads;
      
      // Populate squad select
      squadSelect.innerHTML = '<option value="">Select Squad...</option>';
      squads.forEach(squad => {
        const option = document.createElement('option');
        option.value = squad.id;
        option.textContent = squad.number ? `${squad.name} - ${squad.number}` : squad.name;
        squadSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Failed to load squads:', error);
  }
}

// Initialize or load existing event
async function initializeEvent() {
  try {
    await apiCall('/api/attendance/create', 'POST');
    showSuccess('Event initialized successfully');
  } catch (error: any) {
    showError(`Failed to initialize event: ${error.message}`);
  }
}

// UI helper functions
function showError(message: string) {
  errorContainer.innerHTML = `<div class="error">${message}</div>`;
  setTimeout(() => {
    errorContainer.innerHTML = '';
  }, 5000);
}

function showSuccess(message: string) {
  successContainer.innerHTML = `<div class="success">${message}</div>`;
  setTimeout(() => {
    successContainer.innerHTML = '';
  }, 3000);
}

// Member management functions
async function addMember() {
  const targetUserId = (document.getElementById('targetUserId') as HTMLInputElement).value.trim();
  const squad = squadSelect.value;
  
  if (!targetUserId || !squad) {
    showError('Please enter a user ID and select a squad');
    return;
  }
  
  try {
    const result = await apiCall('/api/attendance/add-member', 'POST', {
      targetUserId,
      squad
    });
    
    showSuccess(result.message);
    await refreshSummary();
    
    // Clear inputs
    (document.getElementById('targetUserId') as HTMLInputElement).value = '';
    squadSelect.value = '';
  } catch (error: any) {
    showError(error.message);
  }
}

async function moveMember() {
  const targetUserId = (document.getElementById('targetUserId') as HTMLInputElement).value.trim();
  const squad = squadSelect.value;
  
  if (!targetUserId || !squad) {
    showError('Please enter a user ID and select a squad');
    return;
  }
  
  try {
    const result = await apiCall('/api/attendance/move-member', 'POST', {
      targetUserId,
      squad
    });
    
    showSuccess(result.message);
    await refreshSummary();
    
    // Clear inputs
    (document.getElementById('targetUserId') as HTMLInputElement).value = '';
    squadSelect.value = '';
  } catch (error: any) {
    showError(error.message);
  }
}

async function removeMember() {
  const targetUserId = (document.getElementById('targetUserId') as HTMLInputElement).value.trim();
  
  if (!targetUserId) {
    showError('Please enter a user ID');
    return;
  }
  
  try {
    const result = await apiCall('/api/attendance/remove-member', 'POST', {
      targetUserId
    });
    
    showSuccess(result.message);
    await refreshSummary();
    
    // Clear inputs
    (document.getElementById('targetUserId') as HTMLInputElement).value = '';
  } catch (error: any) {
    showError(error.message);
  }
}

// Special action functions
async function markAsLead() {
  const targetUserId = (document.getElementById('specialTargetUserId') as HTMLInputElement).value.trim();
  
  if (!targetUserId) {
    showError('Please enter a user ID');
    return;
  }
  
  try {
    const result = await apiCall('/api/attendance/mark-lead', 'POST', {
      targetUserId
    });
    
    showSuccess(result.message);
    await refreshSummary();
    
    // Clear inputs
    (document.getElementById('specialTargetUserId') as HTMLInputElement).value = '';
  } catch (error: any) {
    showError(error.message);
  }
}

async function markAsLate() {
  const targetUserId = (document.getElementById('specialTargetUserId') as HTMLInputElement).value.trim();
  const note = (document.getElementById('lateNote') as HTMLInputElement).value.trim();
  
  if (!targetUserId) {
    showError('Please enter a user ID');
    return;
  }
  
  try {
    const result = await apiCall('/api/attendance/mark-late', 'POST', {
      targetUserId,
      note: note || undefined
    });
    
    showSuccess(result.message);
    await refreshSummary();
    
    // Clear inputs
    (document.getElementById('specialTargetUserId') as HTMLInputElement).value = '';
    (document.getElementById('lateNote') as HTMLInputElement).value = '';
  } catch (error: any) {
    showError(error.message);
  }
}

async function addAsStaff() {
  const targetUserId = (document.getElementById('specialTargetUserId') as HTMLInputElement).value.trim();
  
  if (!targetUserId) {
    showError('Please enter a user ID');
    return;
  }
  
  try {
    const result = await apiCall('/api/attendance/add-staff', 'POST', {
      targetUserId
    });
    
    showSuccess(result.message);
    await refreshSummary();
    
    // Clear inputs
    (document.getElementById('specialTargetUserId') as HTMLInputElement).value = '';
  } catch (error: any) {
    showError(error.message);
  }
}

async function setAsCohost() {
  const targetUserId = (document.getElementById('specialTargetUserId') as HTMLInputElement).value.trim();
  
  if (!targetUserId) {
    showError('Please enter a user ID');
    return;
  }
  
  try {
    const result = await apiCall('/api/attendance/set-cohost', 'POST', {
      targetUserId
    });
    
    showSuccess(result.message);
    await refreshSummary();
    
    // Clear inputs
    (document.getElementById('specialTargetUserId') as HTMLInputElement).value = '';
  } catch (error: any) {
    showError(error.message);
  }
}

// Summary and export functions
async function refreshSummary() {
  try {
    const result = await apiCall('/api/attendance/summary', 'GET');
    
    if (result.success && result.summary) {
      displaySummary(result.summary);
    } else {
      eventSummaryEl.innerHTML = '<div class="loading">No event data available</div>';
    }
  } catch (error: any) {
    console.error('Failed to refresh summary:', error);
    eventSummaryEl.innerHTML = '<div class="error">Failed to load summary</div>';
  }
}

function displaySummary(summary: EventSummary) {
  const squadMap: Record<string, { name: string, number?: string }> = {};
  squads.forEach(squad => {
    squadMap[squad.id] = { name: squad.name, number: squad.number };
  });

  let html = '<div class="event-info">';
  html += `<div><strong>Host:</strong> ${summary.host ? `<@${summary.host.discordId}>` : 'None'}</div>`;
  html += `<div><strong>Co-Host:</strong> ${summary.cohost ? `<@${summary.cohost.discordId}>` : 'None'}</div>`;
  html += `<div><strong>Staff:</strong> ${summary.staff?.map(s => `<@${s.user.discordId}>`).join(', ') || 'None'}</div>`;
  html += '</div>';

  if (summary.squads && summary.squads.length > 0) {
    summary.squads.forEach(squad => {
      const squadInfo = squadMap[squad.name] || { name: squad.name };
      html += '<div class="squad">';
      html += `<div class="squad-header">${squadInfo.name}${squadInfo.number ? ` - ${squadInfo.number}` : ''}</div>`;
      
      if (squad.members && squad.members.length > 0) {
        squad.members.forEach(member => {
          html += '<div class="member">';
          html += `<@${member.user.discordId}>`;
          
          if (member.isLead) {
            html += '<span class="badge lead">Lead</span>';
          }
          if (member.isLate) {
            html += '<span class="badge late">Late</span>';
            if (member.lateNote) {
              html += ` <span style="font-size: 12px; color: var(--discord-text-muted);">(${member.lateNote})</span>`;
            }
          }
          if (member.isSplit) {
            html += '<span class="badge split">Split</span>';
            if (member.splitFrom) {
              html += ` <span style="font-size: 12px; color: var(--discord-text-muted);">(from ${member.splitFrom})</span>`;
            }
          }
          
          html += '</div>';
        });
      } else {
        html += '<div class="member" style="color: var(--discord-text-muted); font-style: italic;">No members</div>';
      }
      
      html += '</div>';
    });
  } else {
    html += '<div class="loading">No squads created</div>';
  }

  eventSummaryEl.innerHTML = html;
}

async function copyFormattedText() {
  try {
    const result = await apiCall('/api/attendance/formatted-summary', 'GET');
    
    if (result.success && result.formattedText) {
      await navigator.clipboard.writeText(result.formattedText);
      showSuccess('Formatted text copied to clipboard!');
      
      // Also show the formatted text
      formattedTextEl.textContent = result.formattedText;
      formattedTextEl.style.display = 'block';
    }
  } catch (error: any) {
    showError(`Failed to copy text: ${error.message}`);
  }
}

// Make functions global for HTML onclick handlers
(window as any).addMember = addMember;
(window as any).moveMember = moveMember;
(window as any).removeMember = removeMember;
(window as any).markAsLead = markAsLead;
(window as any).markAsLate = markAsLate;
(window as any).addAsStaff = addAsStaff;
(window as any).setAsCohost = setAsCohost;
(window as any).refreshSummary = refreshSummary;
(window as any).copyFormattedText = copyFormattedText;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeDiscordSDK);