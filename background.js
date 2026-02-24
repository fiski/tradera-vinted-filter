
// Initialize badge count and active tab status
let badgeCount = 0;
let isOnFilterSite = false;

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateBadgeCount') {
    badgeCount = message.count;
    isOnFilterSite = true;
    updateBadge();
    sendResponse({ success: true });
  } else if (message.action === 'leavingSite') {
    isOnFilterSite = false;
    updateBadge();
    sendResponse({ success: true });
  }
  
  // Return true to indicate we want to send a response asynchronously
  return true;
});

// Update the badge with the current count
function updateBadge() {
  // Only show badge when on Tradera or Vinted
  if (isOnFilterSite && badgeCount > 0) {
    // Display count on the badge
    chrome.action.setBadgeText({ text: badgeCount.toString() });
    
    // Set badge background color (green)
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  } else {
    // Clear the badge when not on the site or count is 0
    chrome.action.setBadgeText({ text: '' });
  }
}

// Listen for storage changes (in case popup updates the filter settings)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && 
      (changes.excludedBrands || changes.disabledBrands || changes.siteSettings)) {
    // If the brand settings changed, update the badge
    // Content script will send new count after filtering
  }
});

// Listen for tab changes to update badge visibility
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  // Reset site status when switching tabs
  isOnFilterSite = false;
  updateBadge();
});

// Listen for tab URL updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Reset badge when navigating to non-supported sites
    if (!tab.url.includes('vinted.se') && !tab.url.includes('tradera.com')) {
      isOnFilterSite = false;
      updateBadge();
    }
  }
});
