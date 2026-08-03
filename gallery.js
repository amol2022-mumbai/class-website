const captions = [
  'Lab Session — Code Forge',
  'Hackathon Weekend',
  'AI Workshop Demo',
  'Cybersecurity Drill',
  'Student Project Showcase',
  'Cloud Computing Lab',
  'Game Dev Studio',
  'Robotics Club Meetup',
  'Open Hack Hours',
  'Graduation Ceremony',
  'Guest Lecture Series',
  'Campus Tech Fair',
];

let currentIndex = 0;
let lightboxReady = false;

function randomSeed() {
  return Math.floor(Math.random() * 10000);
}

function openLightbox(index) {
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const images = document.querySelectorAll('.gallery-item img');

  currentIndex = index;
  const img = images[index];
  lightboxImg.src = img.src.replace('/600/450', '/1200/900');
  lightboxCaption.textContent = captions[index];
  lightbox.classList.add('active');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const lightbox = document.getElementById('lightbox');
  lightbox.classList.remove('active');
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function showNext(dir) {
  const images = document.querySelectorAll('.gallery-item img');
  currentIndex = (currentIndex + dir + images.length) % images.length;
  openLightbox(currentIndex);
}

function setupLightboxControls() {
  if (lightboxReady) return;
  lightboxReady = true;

  document.getElementById('lightboxClose')?.addEventListener('click', closeLightbox);
  document.getElementById('lightboxPrev')?.addEventListener('click', () => showNext(-1));
  document.getElementById('lightboxNext')?.addEventListener('click', () => showNext(1));

  document.getElementById('lightbox')?.addEventListener('click', e => {
    if (e.target.id === 'lightbox') closeLightbox();
  });

  document.addEventListener('keydown', e => {
    const lightbox = document.getElementById('lightbox');
    if (!lightbox?.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') showNext(-1);
    if (e.key === 'ArrowRight') showNext(1);
  });
}

function buildGallery() {
  const grid = document.getElementById('galleryGrid');
  if (!grid) return;

  grid.innerHTML = '';

  captions.forEach((caption, i) => {
    const seed = randomSeed() + i;
    const item = document.createElement('article');
    item.className = 'gallery-item';
    item.innerHTML = `
      <div class="gallery-frame">
        <img
          src="https://picsum.photos/seed/${seed}/600/450"
          alt="${caption}"
          loading="lazy"
          data-index="${i}"
        >
        <div class="gallery-overlay">
          <span class="gallery-caption">${caption}</span>
          <span class="gallery-zoom">View</span>
        </div>
      </div>
    `;
    item.addEventListener('click', () => openLightbox(i));
    grid.appendChild(item);
  });
}

document.getElementById('shuffleBtn')?.addEventListener('click', buildGallery);

setupLightboxControls();
buildGallery();
