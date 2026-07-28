(function () {
  'use strict';

  const title = document.getElementById('unsubscribeTitle');
  const message = document.getElementById('unsubscribeMessage');
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status');
  const category = params.get('category');
  const labels = {
    target_price: 'Target-price alerts are off.',
    free_game: 'Free-game alerts are off.',
    weekly_digest: 'The weekly digest is off.',
    all: 'All LootRadar deal email is off.'
  };

  if (status === 'success' && Object.prototype.hasOwnProperty.call(labels, category)) {
    title.textContent = 'Preference updated';
    message.textContent = labels[category];
  } else {
    title.textContent = 'This link could not be confirmed';
    message.textContent = 'The unsubscribe link may be invalid or expired. Sign in to review your private email settings.';
  }
})();
