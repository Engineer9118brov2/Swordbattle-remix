document.addEventListener('DOMContentLoaded', () => {
    const player = document.getElementById('player');
    const sword = document.getElementById('sword');

    let posX = 20; // Starting X position
    let posY = 20; // Starting Y position
    const speed = 2; // Adjust the movement speed as needed

    const keysPressed = {};

    const updatePosition = () => {
        if (keysPressed['ArrowLeft'] || keysPressed['a']) posX -= speed;
        if (keysPressed['ArrowRight'] || keysPressed['d']) posX += speed;
        if (keysPressed['ArrowUp'] || keysPressed['w']) posY -= speed;
        if (keysPressed['ArrowDown'] || keysPressed['s']) posY += speed;

        player.style.left = `${posX}px`;
        player.style.top = `${posY}px`;

        // Update the player position within boundaries
        posX = Math.max(0, Math.min(window.innerWidth - player.offsetWidth, posX));
        posY = Math.max(0, Math.min(window.innerHeight - player.offsetHeight, posY));
    };

    // Continuously rotate the player towards the cursor
    const rotatePlayerTowardsCursor = (cursorX, cursorY) => {
        const playerRect = player.getBoundingClientRect();
        const playerCenterX = playerRect.left + (playerRect.width / 2);
        const playerCenterY = playerRect.top + (playerRect.height / 2);

        const angleRad = Math.atan2(cursorY - playerCenterY, cursorX - playerCenterX);
        const angleDeg = angleRad * (180 / Math.PI);
        player.style.transform = `rotate(${angleDeg}deg)`;
    };

    const swingSword = () => {
        sword.style.animation = '';
        setTimeout(() => {
            sword.style.animation = 'swingSword 0.3s ease';
        }, 10); // Short delay to reset and replay the animation
    };

    document.addEventListener('keydown', (event) => {
        keysPressed[event.key.toLowerCase()] = true; // Support both lower and uppercase inputs
        if (event.key === ' ') {
            event.preventDefault(); // Prevent the default spacebar action
            swingSword();
        }
    });

    document.addEventListener('keyup', (event) => {
        keysPressed[event.key.toLowerCase()] = false;
    });

    document.addEventListener('mousemove', (event) => {
        rotatePlayerTowardsCursor(event.clientX, event.clientY);
    });

    // Animation loop for smooth movement
    const animate = () => {
        updatePosition(); // Move player based on keys pressed
        requestAnimationFrame(animate); // Request the next frame for smooth animation
    };

    animate(); // Start the animations
});
