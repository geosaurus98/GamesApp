// Card table helper shared by card games: builds card elements, places them
// with animated transforms, and turns pointer input into taps and drags.
//
// The game supplies:
//   getDrag(id)            -> ids to drag together (top card first), or null
//   onTap(id)              -> called for a tap on a card
//   onDrop(ids, cx, cy)    -> try the drop at the dragged card's centre
//                             (board pixels); return true if it moved

export const SUITS = ['♠', '♥', '♦', '♣'];
export const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];
export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const isRed = (suit) => suit === 1 || suit === 2;

const DRAG_THRESHOLD = 6;

export function createTable(board, { getDrag, onTap, onDrop }) {
  const els = new Map();
  const base = new Map(); // id -> { x, y, z }

  function addCard(id, suit, rank) {
    const el = document.createElement('div');
    el.className = `card${isRed(suit) ? ' red' : ''}`;
    el.dataset.id = id;
    const corner = document.createElement('span');
    corner.className = 'corner';
    corner.append(RANKS[rank]);
    const small = document.createElement('small');
    small.textContent = SUITS[suit];
    corner.append(small);
    const pip = document.createElement('span');
    pip.className = 'pip';
    pip.textContent = SUITS[suit];
    el.append(corner, pip);
    el.setAttribute('aria-label', `${RANKS[rank]} of ${SUIT_NAMES[suit]}`);
    board.append(el);
    els.set(id, el);
    return el;
  }

  function place(id, x, y, z, faceUp = true) {
    const el = els.get(id);
    base.set(id, { x, y, z });
    el.classList.toggle('down', !faceUp);
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.style.zIndex = z;
  }

  function hide(id) {
    const el = els.get(id);
    el.style.visibility = 'hidden';
  }

  function show(id) {
    els.get(id).style.visibility = '';
  }

  function restart(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  }

  let drag = null;

  board.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.card');
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const id = Number(el.dataset.id);
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    drag = { id, ids: getDrag(id), pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, moved: false };
  });

  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId || !drag.ids) return;
    drag.dx = e.clientX - drag.x0;
    drag.dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(drag.dx, drag.dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    for (const id of drag.ids) {
      const el = els.get(id);
      const b = base.get(id);
      el.classList.add('dragging');
      el.style.transform = `translate(${b.x + drag.dx}px, ${b.y + drag.dy}px)`;
      el.style.zIndex = 1000 + b.z;
    }
  });

  function settle(d) {
    for (const id of d.ids ?? []) {
      const el = els.get(id);
      const b = base.get(id);
      el.classList.remove('dragging');
      el.style.transform = `translate(${b.x}px, ${b.y}px)`;
      el.style.zIndex = b.z;
    }
  }

  window.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    if (!d.moved) {
      onTap(d.id);
      return;
    }
    const b = base.get(d.ids[0]);
    const el = els.get(d.ids[0]);
    const cx = b.x + d.dx + el.offsetWidth / 2;
    const cy = b.y + d.dy + el.offsetHeight / 2;
    for (const id of d.ids) els.get(id).classList.remove('dragging');
    if (!onDrop(d.ids, cx, cy)) settle(d);
  });

  window.addEventListener('pointercancel', () => {
    if (drag) settle(drag);
    drag = null;
  });

  return {
    els,
    addCard,
    place,
    hide,
    show,
    flash: (el) => restart(el, 'hint'),
    nope: (id) => restart(els.get(id), 'nope'),
    isDragging: () => !!drag?.moved,
  };
}

// Index of the column whose centre is nearest to x.
export function nearestColumn(x, count, colX, cw) {
  let best = 0;
  let dist = Infinity;
  for (let i = 0; i < count; i++) {
    const d = Math.abs(colX(i) + cw / 2 - x);
    if (d < dist) {
      dist = d;
      best = i;
    }
  }
  return best;
}
