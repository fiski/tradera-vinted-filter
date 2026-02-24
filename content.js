// Configuration for the observer
const observerConfig = {
  childList: true,
  subtree: true
};

// Store the observer instance
let observer;

// Counter for filtered items
let filteredItemsCount = 0;

// In-memory brand cache — eliminates storage reads from the hot path
let cachedActiveBrands = null;    // lowercase, pre-computed; null = not loaded
let cachedSiteSettings = null;

// Determine which site we're on
const currentSite = window.location.hostname.includes('vinted.se') ? 'vinted' :
                   window.location.hostname.includes('tradera.com') ? 'tradera' : null;

console.log('Brand Filter running on:', currentSite);

// Populate the brand cache from storage and call an optional callback
function loadBrandsCache(callback) {
  chrome.storage.sync.get({
    excludedBrands: [],
    disabledBrands: [],
    siteSettings: { vinted: true, tradera: true }
  }, function(data) {
    const active = data.excludedBrands.filter(b => !data.disabledBrands.includes(b));
    cachedActiveBrands = active.map(b => b.toLowerCase());
    cachedSiteSettings = data.siteSettings;
    if (callback) callback();
  });
}

// Debounce state for the observer
let filterTimer = null;
let pendingNewItems = [];

// MutationObserver callback — collects new item nodes and debounces filtering
function handleMutations(mutationsList) {
  for (const mutation of mutationsList) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (currentSite === 'vinted' && node.matches?.('[data-testid^="grid-item"]')) {
        pendingNewItems.push(node);
      } else if (currentSite === 'tradera' && node.id?.startsWith('item-card-')) {
        pendingNewItems.push(node);
      } else {
        if (currentSite === 'vinted') {
          node.querySelectorAll?.('[data-testid^="grid-item"]').forEach(n => pendingNewItems.push(n));
        } else if (currentSite === 'tradera') {
          node.querySelectorAll?.('[id^="item-card-"]').forEach(n => pendingNewItems.push(n));
        }
      }
    }
  }

  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => {
    const newItems = pendingNewItems.splice(0); // drain and reset
    if (newItems.length > 0) {
      filterItems(newItems);
    }
  }, 50);
}

// Function to start observing DOM changes
function startObserving() {
  const targetNode = document.body;
  observer = new MutationObserver(handleMutations);
  observer.observe(targetNode, observerConfig);
  loadBrandsCache(() => filterProducts());
}

// Full rescan — called on init, URL change, and brand/setting updates
function filterProducts() {
  if (cachedActiveBrands === null) {
    loadBrandsCache(() => filterProducts());
    return;
  }
  runFilter(null); // null = scan all items
}

// Incremental filter for newly added nodes only — called from observer
function filterItems(nodes) {
  if (cachedActiveBrands === null) return; // cache not ready; init full scan will catch it
  runFilter(nodes);
}

// Shared filter implementation
function runFilter(nodes) {
  try {
    if (!currentSite || !cachedSiteSettings[currentSite]) {
      showAllItems();
      filteredItemsCount = 0;
      updateFilterStats();
      return;
    }

    if (cachedActiveBrands.length === 0) {
      filteredItemsCount = 0;
      updateFilterStats();
      return;
    }

    // If nodes is null, scan the full page; otherwise scan only the provided nodes
    let catalogItems;
    if (nodes !== null) {
      catalogItems = nodes;
    } else if (currentSite === 'vinted') {
      catalogItems = Array.from(document.querySelectorAll('[data-testid^="grid-item"]'));
    } else if (currentSite === 'tradera') {
      catalogItems = Array.from(document.querySelectorAll('[id^="item-card-"]'));
    } else {
      return;
    }

    console.log(`[${currentSite}] Checking ${catalogItems.length} items (${nodes === null ? 'full scan' : 'incremental'})`);

    let addedToHidden = 0;

    catalogItems.forEach(item => {
      // Skip items already hidden by this extension
      if (item.style.display === 'none') return;

      let brandElements = [];

      if (currentSite === 'vinted') {
        const el = item.querySelector('.new-item-box__description p[data-testid$="--description-title"]');
        if (el) brandElements.push(el);
      } else if (currentSite === 'tradera') {
        const titleEl = item.querySelector('[class*="item-card_title"]');
        if (titleEl) brandElements.push(titleEl);
        item.querySelectorAll('.attribute-buttons-list_attribute__ssoUD').forEach(btn => brandElements.push(btn));
        const link = item.querySelector('a.text-truncate-one-line, a.item-card-title');
        if (link) brandElements.push(link);
      }

      if (brandElements.length === 0) return;

      for (const el of brandElements) {
        if (!el?.textContent) continue;
        const text = el.textContent.trim().toLowerCase();
        if (cachedActiveBrands.some(brand => text.includes(brand))) {
          item.style.display = 'none';
          addedToHidden++;
          return;
        }
      }
    });

    // On full scan, recount all hidden items; on incremental, add to existing count
    if (nodes === null) {
      filteredItemsCount = document.querySelectorAll(
        currentSite === 'vinted'
          ? '[data-testid^="grid-item"][style*="display: none"]'
          : '[id^="item-card-"][style*="display: none"]'
      ).length;
    } else {
      filteredItemsCount += addedToHidden;
    }

    console.log(`[${currentSite}] Filtered items count:`, filteredItemsCount);
    updateFilterStats();
  } catch (error) {
    console.error('Error in runFilter:', error);
  }
}

// Function to show all previously hidden items
function showAllItems() {
  try {
    if (currentSite === 'vinted') {
      const items = document.querySelectorAll('[data-testid^="grid-item"]');
      items.forEach(item => {
        item.style.display = '';
      });
    } else if (currentSite === 'tradera') {
      const items = document.querySelectorAll('[id^="item-card-"][style*="display: none"]');
      items.forEach(item => { item.style.display = ''; });
    }
  } catch (error) {
    console.error('Error in showAllItems:', error);
  }
}

// Function to update filter statistics
function updateFilterStats() {
  try {
    sendMessageWithRetry({
      action: 'updateFilterStats',
      stats: {
        filteredCount: filteredItemsCount,
        site: currentSite
      }
    });

    sendMessageWithRetry({
      action: 'updateBadgeCount',
      count: filteredItemsCount
    });
  } catch (error) {
    console.error('Error in updateFilterStats:', error);
  }
}

// Improved function to send chrome runtime messages with retry logic
function sendMessageWithRetry(message, maxRetries = 2) {
  let attempts = 0;

  function trySendMessage() {
    attempts++;

    if (!chrome.runtime) {
      console.warn('Chrome runtime not available');
      return;
    }

    try {
      chrome.runtime.sendMessage(message, function(response) {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message;
          console.warn('Message send error:', errorMsg);

          if (attempts <= maxRetries &&
              (errorMsg.includes('Receiving end does not exist') ||
               errorMsg.includes('connection') ||
               errorMsg.includes('disconnected'))) {
            console.log(`Retrying message send (attempt ${attempts}/${maxRetries})`);
            setTimeout(trySendMessage, 500 * attempts);
          }
        }
      });
    } catch (err) {
      console.error('Error in sendMessage:', err);
      if (attempts <= maxRetries) {
        setTimeout(trySendMessage, 500 * attempts);
      }
    }
  }

  trySendMessage();
}

// Function to delay execution to ensure page is loaded
function ensurePageLoaded(callback, maxAttempts = 15, interval = 500) {
  let attempts = 0;

  function checkAndExecute() {
    attempts++;

    if (document.body) {
      let contentLoaded = false;

      if (currentSite === 'tradera') {
        contentLoaded = document.querySelector('[id^="item-card-"]') !== null ||
                         document.querySelector('[class*="item-card_itemCard"]') !== null;
      } else if (currentSite === 'vinted') {
        contentLoaded = document.querySelector('[data-testid="item-box-wrapper"]') !== null;
      }

      if (contentLoaded || attempts >= maxAttempts) {
        console.log(`Content loaded after ${attempts} attempts`);
        callback();
      } else {
        if (attempts === maxAttempts - 1) {
          console.log('Almost reached max attempts, forcing callback...');
        }
        setTimeout(checkAndExecute, interval);
      }
    } else {
      if (attempts < maxAttempts) {
        setTimeout(checkAndExecute, interval);
      } else {
        console.log('Reached max attempts without body, forcing callback...');
        callback();
      }
    }
  }

  checkAndExecute();
}

// Initialize when the page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    ensurePageLoaded(startObserving);
  });
} else {
  ensurePageLoaded(startObserving);
}

// Listen for URL changes (Both sites are SPAs)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('URL changed, filtering products...');

    filteredItemsCount = 0;

    setTimeout(() => {
      ensurePageLoaded(filterProducts);
    }, 1000);
  }
}).observe(document, {subtree: true, childList: true});

// Add a message listener to handle immediate filtering when brands are updated
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.action === 'brandsUpdated' || message.action === 'siteSettingsUpdated') {
      console.log(`${message.action}, refreshing cache and re-filtering...`);
      loadBrandsCache(() => {
        showAllItems();
        filteredItemsCount = 0;
        filterProducts();
      });
      sendResponse({ success: true });
    }
    else if (message.action === 'requestStats') {
      console.log(`Sending stats: ${filteredItemsCount} items filtered on ${currentSite}`);
      sendResponse({
        stats: {
          filteredCount: filteredItemsCount,
          site: currentSite
        }
      });
    }

    return true;
  } catch (error) {
    console.error('Error in message listener:', error);
    sendResponse({ error: error.message });
    return true;
  }
});

// Clean up on unload
window.addEventListener('beforeunload', function() {
  if (observer) {
    observer.disconnect();
  }

  chrome.runtime.sendMessage({ action: 'leavingSite' }, function(response) {
    // No need to handle response as page is unloading
  });
});
