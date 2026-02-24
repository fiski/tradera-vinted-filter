
document.addEventListener('DOMContentLoaded', function() {
  // Load saved brands when popup opens
  loadBrands();
  
  // Initialize theme
  initTheme();
  
  // Initialize site toggles
  initSiteToggles();

  // Initialize sorting options
  initSorting();
  
  // Set up the form submit event
  document.getElementById('add-brand-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const brandInput = document.getElementById('new-brand');
    const brandName = brandInput.value.trim();
    
    if (brandName) {
      addBrand(brandName);
      brandInput.value = '';
    }
  });
  
  // Set up search functionality
  document.getElementById('brand-search').addEventListener('input', function(e) {
    filterBrandsList(e.target.value.trim().toLowerCase());
  });
  
  // Set up theme toggle
  document.getElementById('theme-toggle').addEventListener('change', function(e) {
    toggleTheme(e.target.checked);
  });
  
  // Set up site toggles
  document.getElementById('vinted-toggle').addEventListener('change', function(e) {
    updateSiteSettings('vinted', e.target.checked);
  });
  
  document.getElementById('tradera-toggle').addEventListener('change', function(e) {
    updateSiteSettings('tradera', e.target.checked);
  });
  
  // Set up export button
  document.getElementById('export-btn').addEventListener('click', exportBrands);
  
  // Set up import button
  document.getElementById('import-btn').addEventListener('click', function() {
    document.getElementById('import-modal').style.display = 'block';
  });
  
  // Close modal when clicking on X
  document.querySelector('.close').addEventListener('click', function() {
    document.getElementById('import-modal').style.display = 'none';
  });
  
  // Close modal when clicking outside of it
  window.addEventListener('click', function(event) {
    const modal = document.getElementById('import-modal');
    if (event.target == modal) {
      modal.style.display = 'none';
    }
  });
  
  // Save imported brands
  document.getElementById('save-import').addEventListener('click', importBrands);
  
  // Listen for statistics updates from content script
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === 'updateFilterStats') {
      updateStatistics(message.stats);
      sendResponse({ received: true });
    }
    return true;
  });
  
  // Request current stats from the active tab
  requestCurrentStats();
});

// Initialize sorting options and set default
function initSorting() {
  // Set default sort method if not already set
  chrome.storage.sync.get({ sortMethod: 'alphabetical' }, function(data) {
    // Update the selected radio button
    document.getElementById(`sort-${data.sortMethod}`).checked = true;
    
    // Add event listeners to sorting radio buttons
    document.querySelectorAll('input[name="sort-method"]').forEach(radio => {
      radio.addEventListener('change', function() {
        if (this.checked) {
          chrome.storage.sync.set({ sortMethod: this.value }, function() {
            loadBrands(); // Reload brands with new sorting
          });
        }
      });
    });
  });
}

// Initialize site toggles based on saved settings
function initSiteToggles() {
  chrome.storage.sync.get({ siteSettings: { vinted: true, tradera: true } }, function(data) {
    document.getElementById('vinted-toggle').checked = data.siteSettings.vinted;
    document.getElementById('tradera-toggle').checked = data.siteSettings.tradera;
  });
}

// Update site settings when toggles are changed
function updateSiteSettings(site, enabled) {
  chrome.storage.sync.get({ siteSettings: { vinted: true, tradera: true } }, function(data) {
    const updatedSettings = {
      ...data.siteSettings,
      [site]: enabled
    };
    
    chrome.storage.sync.set({ siteSettings: updatedSettings }, function() {
      notifySiteSettingsChanged();
    });
  });
}

// Notify content script that site settings have changed
function notifySiteSettingsChanged() {
  sendMessageToActiveTabs({ action: 'siteSettingsUpdated' });
}

// Send message to all active tabs with error handling
function sendMessageToActiveTabs(message) {
  chrome.tabs.query({ active: true }, function(tabs) {
    if (tabs.length === 0) {
      console.warn('No active tabs found');
      return;
    }
    
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, message, function(response) {
        if (chrome.runtime.lastError) {
          console.warn(`Error sending message to tab ${tab.id}:`, chrome.runtime.lastError.message);
        }
      });
    });
  });
}

// Initialize theme based on saved preference
function initTheme() {
  chrome.storage.sync.get({ darkMode: false }, function(data) {
    const darkModeEnabled = data.darkMode;
    document.getElementById('theme-toggle').checked = darkModeEnabled;
    toggleTheme(darkModeEnabled);
  });
}

// Toggle between light and dark themes
function toggleTheme(isDark) {
  const html = document.documentElement;
  
  if (isDark) {
    html.classList.add('dark');
    html.classList.remove('light');
  } else {
    html.classList.add('light');
    html.classList.remove('dark');
  }
  
  chrome.storage.sync.set({ darkMode: isDark });
}

// Filter the brands list based on search input
function filterBrandsList(searchText) {
  const brandItems = document.querySelectorAll('.brand-item');
  
  brandItems.forEach(function(item) {
    const brandName = item.querySelector('.brand-name').textContent.toLowerCase();
    
    if (brandName.includes(searchText)) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });
}

// Sort brands based on selected method
function sortBrands(brands, method, timestamps) {
  if (method === 'latest') {
    // Sort by timestamps (most recent first)
    return brands.sort((a, b) => {
      const timeA = timestamps[a] || 0;
      const timeB = timestamps[b] || 0;
      return timeB - timeA;
    });
  } else {
    // Default: Alphabetical sorting
    return brands.sort((a, b) => a.localeCompare(b));
  }
}

// Load brands from storage and display them
function loadBrands() {
  chrome.storage.sync.get({ 
    excludedBrands: [], 
    disabledBrands: [],
    brandTimestamps: {},
    sortMethod: 'alphabetical'
  }, function(data) {
    const brandsContainer = document.getElementById('brands-container');
    brandsContainer.innerHTML = '';
    
    const activeCount = data.excludedBrands.length - data.disabledBrands.length;
    document.getElementById('brand-count').textContent = `Excluding ${activeCount} of ${data.excludedBrands.length} brands`;
    
    if (data.excludedBrands.length === 0) {
      brandsContainer.innerHTML = '<p>No brands added yet.</p>';
      return;
    }
    
    // Sort brands based on selected method
    const sortedBrands = sortBrands(data.excludedBrands, data.sortMethod, data.brandTimestamps);
    
    sortedBrands.forEach(function(brand) {
      const brandElement = document.createElement('div');
      brandElement.className = 'brand-item';
      
      const brandName = document.createElement('span');
      brandName.className = 'brand-name';
      brandName.textContent = brand;
      
      const brandControls = document.createElement('div');
      brandControls.className = 'brand-controls';
      
      const toggleLabel = document.createElement('label');
      toggleLabel.className = 'toggle-switch';
      
      const toggleInput = document.createElement('input');
      toggleInput.type = 'checkbox';
      toggleInput.checked = !data.disabledBrands.includes(brand);
      toggleInput.addEventListener('change', function() {
        toggleBrand(brand, toggleInput.checked);
      });
      
      const slider = document.createElement('span');
      slider.className = 'slider';
      
      toggleLabel.appendChild(toggleInput);
      toggleLabel.appendChild(slider);
      
      const removeButton = document.createElement('span');
      removeButton.className = 'remove-btn';
      removeButton.textContent = '✕';
      removeButton.addEventListener('click', function() {
        removeBrand(brand);
      });
      
      brandControls.appendChild(toggleLabel);
      brandControls.appendChild(removeButton);
      
      brandElement.appendChild(brandName);
      brandElement.appendChild(brandControls);
      brandsContainer.appendChild(brandElement);
    });
  });
}

// Add a new brand to excluded list
function addBrand(brand) {
  chrome.storage.sync.get({ 
    excludedBrands: [], 
    disabledBrands: [], 
    brandTimestamps: {} 
  }, function(data) {
    if (!data.excludedBrands.includes(brand)) {
      const updatedBrands = [...data.excludedBrands, brand];
      const updatedTimestamps = {...data.brandTimestamps};
      
      // Add timestamp for new brand
      updatedTimestamps[brand] = Date.now();
      
      chrome.storage.sync.set({ 
        excludedBrands: updatedBrands,
        brandTimestamps: updatedTimestamps
      }, function() {
        loadBrands();
        notifyContentScript();
      });
    } else {
      alert('This brand is already in your exclude list.');
    }
  });
}

// Remove a brand from excluded list
function removeBrand(brand) {
  chrome.storage.sync.get({ 
    excludedBrands: [], 
    disabledBrands: [],
    brandTimestamps: {}
  }, function(data) {
    const updatedBrands = data.excludedBrands.filter(item => item !== brand);
    const updatedDisabledBrands = data.disabledBrands.filter(item => item !== brand);
    const updatedTimestamps = {...data.brandTimestamps};
    
    // Remove timestamp for deleted brand
    delete updatedTimestamps[brand];
    
    chrome.storage.sync.set({ 
      excludedBrands: updatedBrands,
      disabledBrands: updatedDisabledBrands,
      brandTimestamps: updatedTimestamps
    }, function() {
      loadBrands();
      notifyContentScript();
    });
  });
}

// Toggle a brand on/off
function toggleBrand(brand, isEnabled) {
  chrome.storage.sync.get({ disabledBrands: [] }, function(data) {
    let updatedDisabledBrands;
    
    if (isEnabled) {
      updatedDisabledBrands = data.disabledBrands.filter(item => item !== brand);
    } else {
      if (!data.disabledBrands.includes(brand)) {
        updatedDisabledBrands = [...data.disabledBrands, brand];
      } else {
        updatedDisabledBrands = data.disabledBrands;
      }
    }
    
    chrome.storage.sync.set({ disabledBrands: updatedDisabledBrands }, function() {
      loadBrands();
      notifyContentScript();
    });
  });
}

// Export brands list as text
function exportBrands() {
  chrome.storage.sync.get({ excludedBrands: [] }, function(data) {
    const brandsText = data.excludedBrands.join('\n');
    
    navigator.clipboard.writeText(brandsText).then(function() {
      alert('Brands list copied to clipboard!');
    }).catch(function(err) {
      console.error('Could not copy text: ', err);
      
      const textarea = document.createElement('textarea');
      textarea.value = brandsText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      alert('Brands list copied to clipboard!');
    });
  });
}

// Import brands from text
function importBrands() {
  const importText = document.getElementById('import-brands').value;
  if (!importText.trim()) {
    alert('Please enter some brands to import.');
    return;
  }
  
  const brandsToImport = importText.split('\n')
    .map(brand => brand.trim())
    .filter(brand => brand.length > 0);
  
  chrome.storage.sync.get({ 
    excludedBrands: [],
    brandTimestamps: {}
  }, function(data) {
    let newBrands = [];
    let duplicates = 0;
    const now = Date.now();
    const updatedTimestamps = {...data.brandTimestamps};
    
    brandsToImport.forEach(brand => {
      if (!data.excludedBrands.includes(brand)) {
        newBrands.push(brand);
        // Add timestamp for new brand
        updatedTimestamps[brand] = now;
      } else {
        duplicates++;
      }
    });
    
    const updatedBrands = [...data.excludedBrands, ...newBrands];
    
    chrome.storage.sync.set({ 
      excludedBrands: updatedBrands,
      brandTimestamps: updatedTimestamps
    }, function() {
      document.getElementById('import-modal').style.display = 'none';
      document.getElementById('import-brands').value = '';
      
      let message = `Imported ${newBrands.length} brands.`;
      if (duplicates > 0) {
        message += ` (${duplicates} duplicates skipped)`;
      }
      
      alert(message);
      loadBrands();
      notifyContentScript();
    });
  });
}

// Request current statistics from the active tab with retry
function requestCurrentStats() {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs.length === 0) {
      console.warn('No active tabs found to request stats from');
      updateStatistics({ filteredCount: 0, site: null });
      return;
    }
    
    const activeTab = tabs[0];
    sendMessageWithRetry(
      activeTab.id,
      { action: 'requestStats' },
      function(response) {
        if (response && response.stats) {
          updateStatistics(response.stats);
        } else {
          updateStatistics({ filteredCount: 0, site: null });
        }
      }
    );
  });
}

// Send message with retry logic
function sendMessageWithRetry(tabId, message, callback, maxRetries = 2) {
  let attempts = 0;
  
  function trySendMessage() {
    attempts++;
    chrome.tabs.sendMessage(tabId, message, function(response) {
      if (chrome.runtime.lastError) {
        console.warn(`Error sending message (attempt ${attempts}):`, chrome.runtime.lastError.message);
        
        if (attempts <= maxRetries) {
          setTimeout(trySendMessage, 500 * attempts);
        } else if (callback) {
          callback(null);
        }
      } else if (callback) {
        callback(response);
      }
    });
  }
  
  trySendMessage();
}

// Update statistics in the UI
function updateStatistics(stats) {
  if (!stats) {
    document.getElementById('filtered-count').textContent = 'Items filtered: 0';
    return;
  }
  
  let siteInfo = '';
  if (stats.site) {
    siteInfo = ` (${stats.site.charAt(0).toUpperCase() + stats.site.slice(1)})`;
  }
  
  const count = stats.filteredCount || 0;
  document.getElementById('filtered-count').textContent = `Items filtered${siteInfo}: ${count}`;
}

// Notify content script that brands have been updated
function notifyContentScript() {
  sendMessageToActiveTabs({ action: 'brandsUpdated' });
}
