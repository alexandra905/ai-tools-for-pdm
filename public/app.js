const dateElement = document.querySelector('#current-date');
const slotsElement = document.querySelector('#slots');
const statusElement = document.querySelector('#status');
const feedingForm = document.querySelector('#feeding-form');
const feedingInfoElement = document.querySelector('#feeding-info');
const feedingStatusElement = document.querySelector('#feeding-status');

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle('status--error', isError);
}

function setFeedingStatus(message, isError = false) {
  feedingStatusElement.textContent = message;
  feedingStatusElement.classList.toggle('status--error', isError);
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (text) {
    element.textContent = text;
  }

  return element;
}

function formatDate(date) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
    timeZone: 'Europe/Moscow'
  }).format(new Date(`${date}T12:00:00+03:00`));
}

function formatTime(date) {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow'
  }).format(new Date(date));
}

function renderSlot(slot) {
  const card = createElement('article', `slot ${slot.bookedBy ? 'slot--booked' : 'slot--free'}`);
  const heading = createElement('h3', 'slot__time', slot.slotTime);
  const state = createElement(
    'p',
    'slot__state',
    slot.bookedBy ? `Занято: ${slot.bookedBy}` : 'Свободно'
  );

  card.append(heading, state);

  if (slot.bookedBy) {
    return card;
  }

  const form = document.createElement('form');
  form.className = 'booking-form';
  form.addEventListener('submit', (event) => submitBooking(event, slot.slotTime));

  const label = createElement('label', 'booking-form__label', `ФИО для слота ${slot.slotTime}`);
  const input = document.createElement('input');
  input.name = 'employeeName';
  input.type = 'text';
  input.autocomplete = 'name';
  input.required = true;
  input.placeholder = 'Анна Тестова';

  const button = createElement('button', 'booking-form__button', 'Записаться');
  button.type = 'submit';

  form.append(label, input, button);
  card.append(form);
  return card;
}

function renderSlots(slots) {
  slotsElement.replaceChildren(...slots.map(renderSlot));
}

async function loadSlots() {
  const response = await fetch('/api/walk-slots');

  if (!response.ok) {
    throw new Error('Не удалось загрузить слоты. Обновите страницу и попробуйте снова.');
  }

  const { date, slots } = await response.json();
  dateElement.textContent = `Сегодня, ${formatDate(date)}`;
  renderSlots(slots);
}

async function submitBooking(event, slotTime) {
  event.preventDefault();

  const form = event.currentTarget;
  const input = form.elements.employeeName;
  const employeeName = input.value.trim();

  if (!employeeName) {
    setStatus('Введите непустое ФИО.', true);
    input.focus();
    return;
  }

  const button = form.querySelector('button');
  button.disabled = true;
  setStatus('Сохраняем запись…');

  try {
    const response = await fetch('/api/walk-slots/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotTime, employeeName })
    });
    const result = await response.json();

    if (!response.ok) {
      setStatus(result.error || 'Не удалось записаться.', true);
      await loadSlots();
      return;
    }

    setStatus(result.message);
    await loadSlots();
  } catch {
    setStatus('Не удалось связаться с сервером. Попробуйте ещё раз.', true);
  } finally {
    button.disabled = false;
  }
}

async function loadLastFeeding() {
  const response = await fetch('/api/feedings/latest');

  if (!response.ok) {
    throw new Error('Не удалось загрузить последнее кормление.');
  }

  const { feeding } = await response.json();

  feedingInfoElement.textContent = feeding
    ? `Последний раз кормил(а): ${feeding.employeeName}, ${formatTime(feeding.fedAt)}`
    : 'Отметок о кормлении пока нет.';
}

async function submitFeeding(event) {
  event.preventDefault();

  const input = feedingForm.elements.employeeName;
  const employeeName = input.value.trim();

  if (!employeeName) {
    setFeedingStatus('Введите непустое ФИО.', true);
    input.focus();
    return;
  }

  const button = feedingForm.querySelector('button');
  button.disabled = true;
  setFeedingStatus('Сохраняем отметку…');

  try {
    const response = await fetch('/api/feedings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeName })
    });
    const result = await response.json();

    if (!response.ok) {
      setFeedingStatus(result.error || 'Не удалось отметить кормление.', true);
      return;
    }

    input.value = '';
    setFeedingStatus(result.message);
    await loadLastFeeding();
  } catch {
    setFeedingStatus('Не удалось связаться с сервером. Попробуйте ещё раз.', true);
  } finally {
    button.disabled = false;
  }
}

feedingForm.addEventListener('submit', submitFeeding);
loadSlots().catch((error) => setStatus(error.message, true));
loadLastFeeding().catch((error) => setFeedingStatus(error.message, true));
