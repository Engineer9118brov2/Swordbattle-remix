// Home page shop system using localStorage
const skins = {
  'warrior': { name: 'Warrior', strength: 1.0, endurance: 1.0, speed: 1.0, cost: 0 },
  'brute': { name: 'Brute', strength: 1.3, endurance: 1.5, speed: 0.8, cost: 500 },
  'ninja': { name: 'Ninja', strength: 0.9, endurance: 0.8, speed: 1.4, cost: 500 },
  'tank': { name: 'Tank', strength: 0.8, endurance: 2.0, speed: 0.6, cost: 500 },
  'phantom': { name: 'Phantom', strength: 1.1, endurance: 0.7, speed: 1.3, cost: 750 }
};

let playerCoins = localStorage.getItem('playerCoins') ? parseInt(localStorage.getItem('playerCoins')) : 0;
let selectedSkin = localStorage.getItem('selectedSkin') || 'warrior';
const ownedSkins = new Set(JSON.parse(localStorage.getItem('ownedSkins') || '["warrior"]'));

function saveProgress() {
  localStorage.setItem('playerCoins', playerCoins);
  localStorage.setItem('selectedSkin', selectedSkin);
  localStorage.setItem('ownedSkins', JSON.stringify([...ownedSkins]));
}

function openShop() {
  document.getElementById('shopModal').classList.remove('hidden');
  renderShopItems();
}

function closeShop() {
  document.getElementById('shopModal').classList.add('hidden');
}

function renderShopItems() {
  const container = document.getElementById('shopItems');

  container.innerHTML = Object.entries(skins)
    .map(([skinKey, skinData]) => {
      const owned = ownedSkins.has(skinKey);
      const isSelected = selectedSkin === skinKey;
      const canAfford = playerCoins >= skinData.cost;

      return `
        <div class="shop-item ${owned ? 'owned' : ''} ${isSelected ? 'selected' : ''}">
          <h3>${skinData.name}</h3>
          <div class="stats">
            <div class="stat-line">
              <span>⚔️ Strength:</span>
              <span>${(skinData.strength * 100).toFixed(0)}%</span>
            </div>
            <div class="stat-line">
              <span>🛡️ Endurance:</span>
              <span>${(skinData.endurance * 100).toFixed(0)}%</span>
            </div>
            <div class="stat-line">
              <span>🏃 Speed:</span>
              <span>${(skinData.speed * 100).toFixed(0)}%</span>
            </div>
          </div>
          <div class="cost">${skinData.cost === 0 ? 'Default' : skinData.cost + ' 🪙'}</div>
          ${owned ? `
            <button onclick="selectSkin('${skinKey}')">${isSelected ? '✓ Selected' : 'Select'}</button>
          ` : `
            <button ${!canAfford ? 'disabled' : ''} onclick="buySkin('${skinKey}')">
              ${canAfford ? 'Buy' : 'Not Enough'}
            </button>
          `}
        </div>
      `;
    })
    .join('');

  // Update coins display
  const costDiv = document.querySelector('.shop-info');
  if (!costDiv) {
    const shopContent = document.querySelector('.modal-content');
    const coinDisplay = document.createElement('div');
    coinDisplay.className = 'shop-info';
    coinDisplay.style.cssText = 'text-align: center; margin: 20px 0; font-size: 1.2em; color: #FFD700;';
    coinDisplay.innerHTML = `💰 Coins: ${playerCoins}`;
    shopContent.insertBefore(coinDisplay, container);
  } else {
    costDiv.innerHTML = `💰 Coins: ${playerCoins}`;
  }
}

function buySkin(skinKey) {
  const skinData = skins[skinKey];

  if (playerCoins >= skinData.cost) {
    playerCoins -= skinData.cost;
    ownedSkins.add(skinKey);
    selectedSkin = skinKey;
    saveProgress();
    renderShopItems();
    showNotification(`✓ Purchased ${skinData.name}!`);
  } else {
    showNotification(`❌ Not enough coins! Need ${skinData.cost - playerCoins} more.`);
  }
}

function selectSkin(skinKey) {
  if (ownedSkins.has(skinKey)) {
    selectedSkin = skinKey;
    saveProgress();
    renderShopItems();
    showNotification(`✓ Selected ${skins[skinKey].name}!`);
  }
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background-color: #00d4ff;
    color: #1a1a2e;
    padding: 15px 20px;
    border-radius: 8px;
    font-weight: bold;
    z-index: 3000;
    animation: slideIn 0.3s ease;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(400px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(400px); opacity: 0; }
  }
`;
document.head.appendChild(style);

// Setup event listeners
document.addEventListener('DOMContentLoaded', () => {
  const shopBtn = document.getElementById('homeShopBtn');
  const shopModal = document.getElementById('shopModal');
  const closeBtn = document.querySelector('.close');

  if (shopBtn) shopBtn.addEventListener('click', openShop);
  if (closeBtn) closeBtn.addEventListener('click', closeShop);
  if (shopModal) {
    shopModal.addEventListener('click', (e) => {
      if (e.target === shopModal) {
        closeShop();
      }
    });
  }

  renderShopItems();
});
