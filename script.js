document.addEventListener("DOMContentLoaded", () => {
    // Initialize Lucide icons
    lucide.createIcons();

    // DOM Elements
    const elements = {
        button: document.getElementById('startButton'),
        status: document.getElementById('status'),
        currentNote: document.getElementById('currentNote'),
        frequency: document.getElementById('frequency'),
        volumeLevel: document.getElementById('volumeLevel'),
        missionStatus: document.getElementById('missionStatus'),
        missionTimer: document.getElementById('mission-timer'),
        tuningSelect: document.getElementById('tuningSelect'),
        scoreDisplay: document.getElementById('scoreDisplay'),
        livesDisplay: document.getElementById('livesDisplay'),
        gameCanvas: document.getElementById('gameCanvas')
    };

    // Game state
    const gameState = {
        isRunning: false,
        score: 0,
        lives: 3,
        level: 1,
        meteors: [],
        lastMeteorTime: 0,
        meteorInterval: 3000, // Time between meteors in ms
        currentNote: null,
        lastNote: null,
        lastNoteTime: 0, // Add this property to track when we last fired
        rocketPosition: 100, // Position from left
        rocketY: 0, // New property for vertical position
        backgroundStars: [],
        meteorSpeed: 2,
        laserBeams: []
    };

    // Tunings definition
    const tunings = {
        standard: {
            name: "Standard E (EADGBE)",
            frequencies: {
                "E2": 82.41,
                "A2": 110.00,
                "D3": 146.83,
                "G3": 196.00,
                "B3": 246.94,
                "E4": 329.63
            }
        },
        "half-step": {
            name: "Half Step Down",
            frequencies: {
                "Eb2": 77.78,
                "Ab2": 103.83,
                "Db3": 138.59,
                "Gb3": 185.00,
                "Bb3": 233.08,
                "Eb4": 311.13
            }
        },
        dropD: {
            name: "Drop D",
            frequencies: {
                "D2": 73.42,
                "A2": 110.00,
                "D3": 146.83,
                "G3": 196.00,
                "B3": 246.94,
                "E4": 329.63
            }
        }
    };

    // Initialize tuning state
    let currentTuning = "standard";
    let stringFrequencies = tunings[currentTuning].frequencies;
    
    // String to display name mapping
    const stringDisplayNames = {
        "E2": "E (low)",
        "A2": "A",
        "D3": "D",
        "G3": "G",
        "B3": "B",
        "E4": "e (high)"
    };

    // Audio Context and Analyzer
    let audioContext = null;
    let analyser = null;
    let source = null;

    // Constants for audio processing
    const CONSTANTS = {
        SAMPLE_RATE: 44100,
        FFT_SIZE: 2048,
        MIN_FREQUENCY: 40,
        MAX_FREQUENCY: 2500,
        SMOOTHING_WINDOW_SIZE: 5,
        MIN_AMPLITUDE: 0.003,
        FREQUENCY_TOLERANCE: 7 // cents
    };

    // Smoothing window for frequency detection
    const smoothingWindow = [];

    // Get canvas and context
    const canvas = elements.gameCanvas;
    const ctx = canvas.getContext('2d');

    // Set canvas size
    function resizeCanvas() {
        canvas.width = window.innerWidth * 0.8;
        canvas.height = window.innerHeight * 0.6;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize stars
    function initStars() {
        gameState.backgroundStars = [];
        const numStars = 100;
        for (let i = 0; i < numStars; i++) {
            gameState.backgroundStars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2 + 1,
                speed: Math.random() * 2 + 1
            });
        }
    }

    // Create a meteor with a random string name
    function createMeteor() {
        // Get list of string names
        const stringNames = Object.keys(stringFrequencies);
        const randomString = stringNames[Math.floor(Math.random() * stringNames.length)];
        
        // Create meteor with string name
        const meteor = {
            x: canvas.width + 50, // Start off-screen to the right
            y: 50 + Math.random() * (canvas.height - 100),
            size: 30 + Math.random() * 30,
            speed: gameState.meteorSpeed + Math.random() * gameState.level,
            string: randomString,
            displayName: stringDisplayNames[randomString] || randomString,
            destroyed: false,
            rotation: Math.random() * Math.PI
        };
        
        gameState.meteors.push(meteor);
    }

    // Draw the rocket with enhanced details
    function drawRocket(x, y) {
        ctx.save();
        ctx.translate(x, y);
        
        // Rocket thruster flame (if game is running)
        if (gameState.isRunning) {
            // Flame animation using time-based oscillation
            const flameSize = 30 + Math.sin(Date.now() / 100) * 10;
            
            // Outer flame glow
            const flameGradient = ctx.createRadialGradient(-40, 0, 5, -40, 0, flameSize);
            flameGradient.addColorStop(0, 'rgba(255, 165, 0, 0.9)');
            flameGradient.addColorStop(0.5, 'rgba(255, 69, 0, 0.5)');
            flameGradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
            
            ctx.fillStyle = flameGradient;
            ctx.beginPath();
            ctx.arc(-40, 0, flameSize, 0, Math.PI * 2);
            ctx.fill();
            
            // Inner flame
            ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
            ctx.beginPath();
            ctx.moveTo(-40, -5);
            ctx.lineTo(-60 - Math.random() * 15, 0);
            ctx.lineTo(-40, 5);
            ctx.closePath();
            ctx.fill();
        }
        
        // Rocket body
        const bodyGradient = ctx.createLinearGradient(0, -25, 0, 25);
        bodyGradient.addColorStop(0, '#60a5fa');
        bodyGradient.addColorStop(0.5, '#3b82f6');
        bodyGradient.addColorStop(1, '#1d4ed8');
        
        ctx.fillStyle = bodyGradient;
        ctx.beginPath();
        // Main body
        ctx.moveTo(40, 0);
        ctx.lineTo(20, -15);
        ctx.lineTo(-30, -15);
        ctx.lineTo(-40, -8);
        ctx.lineTo(-40, 8);
        ctx.lineTo(-30, 15);
        ctx.lineTo(20, 15);
        ctx.closePath();
        ctx.fill();
        
        // Rocket nose cone
        const noseGradient = ctx.createLinearGradient(20, 0, 50, 0);
        noseGradient.addColorStop(0, '#3b82f6');
        noseGradient.addColorStop(1, '#60a5fa');
        
        ctx.fillStyle = noseGradient;
        ctx.beginPath();
        ctx.moveTo(20, -15);
        ctx.lineTo(50, 0);
        ctx.lineTo(20, 15);
        ctx.closePath();
        ctx.fill();
        
        // Rocket windows
        ctx.fillStyle = '#dbeafe';
        ctx.beginPath();
        ctx.arc(10, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#bfdbfe';
        ctx.beginPath();
        ctx.arc(-10, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Rocket fins
        ctx.fillStyle = '#1d4ed8';
        
        // Top fin
        ctx.beginPath();
        ctx.moveTo(-20, -15);
        ctx.lineTo(-30, -30);
        ctx.lineTo(-10, -15);
        ctx.closePath();
        ctx.fill();
        
        // Bottom fin
        ctx.beginPath();
        ctx.moveTo(-20, 15);
        ctx.lineTo(-30, 30);
        ctx.lineTo(-10, 15);
        ctx.closePath();
        ctx.fill();
        
        // Outline
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Add guitar strings as laser cannons
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.8)';
        ctx.lineWidth = 1;
        
        for (let i = 0; i < 6; i++) {
            const yPos = -10 + (i * 4);
            ctx.beginPath();
            ctx.moveTo(20, yPos);
            ctx.lineTo(40, yPos);
            ctx.stroke();
            
            // Add small cannon barrels
            ctx.fillStyle = '#94a3b8';
            ctx.beginPath();
            ctx.arc(40, yPos, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Add glow effect if powered up (after level increase)
        if (gameState.level > 1) {
            const glowOpacity = 0.3 + Math.sin(Date.now() / 500) * 0.2;
            ctx.fillStyle = `rgba(96, 165, 250, ${glowOpacity})`;
            ctx.beginPath();
            ctx.arc(10, 0, 25, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }

    // Draw a meteor with string name
    function drawMeteor(meteor) {
        ctx.save();
        ctx.translate(meteor.x, meteor.y);
        ctx.rotate(meteor.rotation);
        
        // Draw meteor body with glow effect
        // Outer glow
        const gradient = ctx.createRadialGradient(0, 0, meteor.size * 0.8, 0, 0, meteor.size * 1.3);
        gradient.addColorStop(0, 'rgba(160, 82, 45, 1)');
        gradient.addColorStop(0.7, 'rgba(160, 82, 45, 0.6)');
        gradient.addColorStop(1, 'rgba(160, 82, 45, 0)');
        
        ctx.beginPath();
        ctx.arc(0, 0, meteor.size * 1.3, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Main meteor body
        ctx.fillStyle = '#a0522d';
        ctx.beginPath();
        ctx.arc(0, 0, meteor.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8b4513';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Add crater details
        ctx.fillStyle = 'rgba(139, 69, 19, 0.5)';
        const craterPositions = [
            { x: meteor.size * 0.4, y: meteor.size * -0.3, size: meteor.size * 0.2 },
            { x: meteor.size * -0.5, y: meteor.size * 0.2, size: meteor.size * 0.25 },
            { x: meteor.size * 0.1, y: meteor.size * 0.4, size: meteor.size * 0.15 }
        ];
        
        craterPositions.forEach(crater => {
            ctx.beginPath();
            ctx.arc(crater.x, crater.y, crater.size, 0, Math.PI * 2);
            ctx.fill();
        });
        
        // Create a background for the text
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.arc(0, 0, meteor.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw string name with glow effect
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = 'white';
        ctx.font = `bold ${Math.max(16, meteor.size / 2)}px Orbitron, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(meteor.displayName, 0, 0);
        
        ctx.restore();
    }

    // Draw a laser beam with improved effects
    function drawLaser(laser) {
        ctx.save();
        
        // Calculate how long the laser has been active (for animation)
        const now = Date.now();
        const age = now - laser.timestamp;
        const lifespan = 500; // 0.5 second lifespan
        const lifeFactor = Math.max(0, 1 - (age / lifespan)); // Ensure positive value
        
        // Create a gradient for the laser beam
        const gradient = ctx.createLinearGradient(
            laser.startX, laser.startY, 
            laser.endX, laser.endY
        );
        
        gradient.addColorStop(0, 'rgba(96, 165, 250, 1)');
        gradient.addColorStop(0.5, 'rgba(129, 140, 248, 1)');
        gradient.addColorStop(1, 'rgba(96, 165, 250, 0.1)');
        
        // Draw main beam
        ctx.strokeStyle = gradient;
        ctx.lineWidth = Math.max(1, 3 * lifeFactor); // Ensure positive line width
        ctx.beginPath();
        ctx.moveTo(laser.startX, laser.startY);
        ctx.lineTo(laser.endX, laser.endY);
        ctx.stroke();
        
        // Add pulse effect along the beam
        const distance = Math.sqrt(
            Math.pow(laser.endX - laser.startX, 2) + 
            Math.pow(laser.endY - laser.startY, 2)
        );
        
        // Only draw pulses if we have a meaningful distance
        if (distance > 10) {
            const pulseCount = Math.min(5, Math.floor(distance / 50));
            const dx = (laser.endX - laser.startX) / pulseCount;
            const dy = (laser.endY - laser.startY) / pulseCount;
            
            // Ensure pulse size is always positive
            const pulseSize = Math.max(2, 5 * lifeFactor);
            
            for (let i = 0; i < pulseCount; i++) {
                const pulseX = laser.startX + (i * dx) + ((age / 50) % Math.max(1, dx));
                const pulseY = laser.startY + (i * dy) + ((age / 50) % Math.max(1, dy));
                
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.beginPath();
                ctx.arc(pulseX, pulseY, pulseSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Draw glow effect
        ctx.globalAlpha = Math.max(0.1, 0.5 * lifeFactor);
        ctx.shadowColor = 'rgba(96, 165, 250, 0.8)';
        ctx.shadowBlur = 15;
        ctx.strokeStyle = 'rgba(129, 140, 248, 0.5)';
        ctx.lineWidth = Math.max(1, 8 * lifeFactor);
        ctx.beginPath();
        ctx.moveTo(laser.startX, laser.startY);
        ctx.lineTo(laser.endX, laser.endY);
        ctx.stroke();
        
        ctx.restore();
    }
    
    // Fire a laser from the rocket
    function fireLaser(targetString) {
        const laser = {
            startX: gameState.rocketPosition + 40,
            startY: gameState.rocketY,
            endX: canvas.width,
            endY: gameState.rocketY,
            targetString: targetString,
            timestamp: Date.now()
        };
        
        gameState.laserBeams.push(laser);
        
        // Play laser sound
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Quick volume ramp for a laser sound
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.2);
    }
    
    // Create explosion effect with animation
    let explosions = [];
    
    function createExplosion(x, y, size) {
        explosions.push({
            x,
            y,
            size,
            particles: [],
            timestamp: Date.now(),
            duration: 1500 // 1.5 seconds
        });
        
        // Create particles
        const particleCount = Math.floor(size * 0.8);
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            const particleSize = 2 + Math.random() * 4;
            
            explosions[explosions.length - 1].particles.push({
                x: 0,
                y: 0,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: particleSize,
                color: getExplosionParticleColor(),
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.2
            });
        }
        
        // Play explosion sound
        playExplosionSound();
    }
    
    function getExplosionParticleColor() {
        const colors = [
            '#ffcc00', // yellow
            '#ff9933', // orange
            '#ff6600', // dark orange
            '#ff3300', // red-orange
            '#ff0000', // red
            '#ffff66'  // light yellow
        ];
        
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    function updateExplosions() {
        const now = Date.now();
        
        // Update each explosion
        explosions = explosions.filter(explosion => {
            // Check if explosion has expired
            if (now - explosion.timestamp > explosion.duration) {
                return false;
            }
            
            // Get explosion progress (0 to 1)
            const progress = (now - explosion.timestamp) / explosion.duration;
            
            // Update particles
            explosion.particles.forEach(particle => {
                // Move particle
                particle.x += particle.vx;
                particle.y += particle.vy;
                
                // Apply some drag
                particle.vx *= 0.98;
                particle.vy *= 0.98;
                
                // Rotate particle
                particle.rotation += particle.rotationSpeed;
            });
            
            return true;
        });
    }
    
    function drawExplosions() {
        const now = Date.now();
        
        // Draw each explosion
        explosions.forEach(explosion => {
            // Get explosion progress (0 to 1)
            const progress = (now - explosion.timestamp) / explosion.duration;
            const opacity = 1 - progress;
            
            ctx.save();
            ctx.translate(explosion.x, explosion.y);
            
            // Draw initial flash
            if (progress < 0.2) {
                const flashOpacity = 1 - (progress / 0.2);
                ctx.globalAlpha = flashOpacity;
                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(0, 0, explosion.size * (1 + progress * 2), 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Draw each particle
            explosion.particles.forEach(particle => {
                ctx.save();
                ctx.globalAlpha = opacity;
                ctx.translate(particle.x, particle.y);
                ctx.rotate(particle.rotation);
                
                // Draw particle
                ctx.fillStyle = particle.color;
                const particleSize = particle.size * (1 - progress * 0.5);
                
                ctx.beginPath();
                ctx.moveTo(0, -particleSize);
                ctx.lineTo(particleSize, 0);
                ctx.lineTo(0, particleSize);
                ctx.lineTo(-particleSize, 0);
                ctx.closePath();
                ctx.fill();
                
                ctx.restore();
            });
            
            ctx.restore();
        });
    }
    
    function playExplosionSound() {
        if (!audioContext) return;
        
        // Create noise for explosion
        const bufferSize = audioContext.sampleRate / 10; // 100ms buffer
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        // Fill with noise
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        // Create source from buffer
        const noise = audioContext.createBufferSource();
        noise.buffer = buffer;
        
        // Create filters for explosion sound
        const lowpass = audioContext.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.setValueAtTime(400, audioContext.currentTime);
        lowpass.Q.setValueAtTime(10, audioContext.currentTime);
        
        // Create gain node for volume envelope
        const gain = audioContext.createGain();
        gain.gain.setValueAtTime(0.8, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        // Connect nodes
        noise.connect(lowpass);
        lowpass.connect(gain);
        gain.connect(audioContext.destination);
        
        // Play sound
        noise.start();
        noise.stop(audioContext.currentTime + 0.5);
    }

    // Check for collisions between lasers and meteors
    function checkCollisions() {
        const now = Date.now();
        
        for (let i = 0; i < gameState.laserBeams.length; i++) {
            const laser = gameState.laserBeams[i];
            
            for (let j = 0; j < gameState.meteors.length; j++) {
                const meteor = gameState.meteors[j];
                
                // Only check collision if meteor matches the laser's target string and isn't destroyed
                if (!meteor.destroyed && meteor.string === laser.targetString) {
                    // For direct laser, calculate if it's close enough to the meteor
                    const distance = Math.sqrt(
                        Math.pow(meteor.x - laser.endX, 2) + 
                        Math.pow(meteor.y - laser.endY, 2)
                    );
                    
                    // If the laser is targeting this meteor (endpoints are close enough)
                    if (distance < meteor.size) {
                        // Laser hit the correct meteor
                        meteor.destroyed = true;
                        
                        // Calculate score based on meteor size
                        const sizeBonus = Math.max(1, 50 / meteor.size);
                        const baseScore = 100 * gameState.level;
                        const totalScore = Math.floor(baseScore * sizeBonus);
                        
                        gameState.score += totalScore;
                        elements.scoreDisplay.textContent = gameState.score;
                        
                        // Create score popup at meteor location
                        createScorePopup(meteor.x, meteor.y, totalScore);
                        
                        // Create explosion effect
                        createExplosion(meteor.x, meteor.y, meteor.size);
                        
                        break;
                    }
                }
            }
        }
    }
    
    // Create a score popup
    const scorePopups = [];
    
    function createScorePopup(x, y, score) {
        scorePopups.push({
            x,
            y,
            score,
            timestamp: Date.now(),
            duration: 1500
        });
    }
    
    function updateScorePopups() {
        const now = Date.now();
        
        // Update each popup
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const popup = scorePopups[i];
            
            // Remove expired popups
            if (now - popup.timestamp > popup.duration) {
                scorePopups.splice(i, 1);
                continue;
            }
            
            // Move popup upward
            popup.y -= 0.5;
        }
    }
    
    function drawScorePopups() {
        const now = Date.now();
        
        // Draw each popup
        scorePopups.forEach(popup => {
            const age = now - popup.timestamp;
            const opacity = 1 - (age / popup.duration);
            const scale = 1 + (age / popup.duration) * 0.5;
            
            ctx.save();
            ctx.translate(popup.x, popup.y);
            ctx.scale(scale, scale);
            ctx.globalAlpha = opacity;
            
            // Score shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.font = 'bold 18px Orbitron, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`+${popup.score}`, 2, 2);
            
            // Score text
            ctx.fillStyle = 'rgba(255, 215, 0, 1)';
            ctx.fillText(`+${popup.score}`, 0, 0);
            
            ctx.restore();
        });
    }

    // Update game state
    function updateGame() {
        // Find the nearest meteor and move rocket
        const nearestMeteor = findNearestMeteor();
        
        // Move rocket to align with the nearest meteor
        if (nearestMeteor) {
            const targetY = nearestMeteor.y;
            const moveSpeed = 2 + (gameState.level * 0.5); // Speed increases with level
            
            // Smoothly move the rocket vertically
            if (Math.abs(targetY - gameState.rocketY) > 5) {
                if (targetY > gameState.rocketY) {
                    gameState.rocketY += moveSpeed;
                } else {
                    gameState.rocketY -= moveSpeed;
                }
            }
        }
        
        // Move stars
        gameState.backgroundStars.forEach(star => {
            star.x -= star.speed;
            if (star.x < 0) {
                star.x = canvas.width;
                star.y = Math.random() * canvas.height;
            }
        });
        
        // Create new meteors at intervals
        const now = Date.now();
        if (now - gameState.lastMeteorTime > gameState.meteorInterval) {
            createMeteor();
            gameState.lastMeteorTime = now;
            
            // Decrease interval as game progresses (making it harder)
            gameState.meteorInterval = Math.max(1000, 3000 - (gameState.level * 300));
        }
        
        // Move meteors
        gameState.meteors.forEach(meteor => {
            meteor.x -= meteor.speed;
            meteor.rotation += 0.01;
            
            // Check if meteor has passed the rocket without being destroyed
            if (!meteor.destroyed && meteor.x < 0) {
                gameState.lives--;
                elements.livesDisplay.textContent = gameState.lives;
                meteor.destroyed = true;
                
                // Create impact effect on ship
                createShipImpact();
                
                // Game over check
                if (gameState.lives <= 0) {
                    stopGame("GAME OVER - OUT OF LIVES");
                } else {
                    elements.status.textContent = `SHIELDS DAMAGED! ${gameState.lives} REMAINING`;
                }
            }
        });
        
        // Update laser beams
        gameState.laserBeams = gameState.laserBeams.filter(laser => {
            // Remove lasers after 1 second
            return (now - laser.timestamp) < 1000;
        });
        
        // Remove destroyed meteors
        gameState.meteors = gameState.meteors.filter(meteor => {
            return meteor.x > -50 || !meteor.destroyed;
        });
        
        // Update explosions
        updateExplosions();
        
        // Check for collisions
        checkCollisions();
        
        // Level up if score threshold is reached
        if (gameState.score >= gameState.level * 1000) {
            gameState.level++;
            elements.status.textContent = `LEVEL UP! NOW AT LEVEL ${gameState.level}`;
            gameState.meteorSpeed += 0.5;
            
            // Play level up sound
            playLevelUpSound();
        }
    }

    // Draw the game
    function drawGame() {
        // Clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw starfield background
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw stars
        gameState.backgroundStars.forEach(star => {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fillRect(star.x, star.y, star.size, star.size);
        });
        
        // Draw laser beams behind everything else
        gameState.laserBeams.forEach(laser => {
            drawLaser(laser);
        });
        
        // Draw meteors
        gameState.meteors.forEach(meteor => {
            if (!meteor.destroyed) {
                drawMeteor(meteor);
            }
        });
        
        // Draw explosions
        drawExplosions();
        
        // Draw the rocket using current position
        drawRocket(gameState.rocketPosition, gameState.rocketY);
        
        // Display currently detected string
        if (gameState.currentNote) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.font = '18px Orbitron, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`Current String: ${gameState.currentNote}`, 20, 40);
        }
        
        // Add string name helper (educational feature)
        drawStringHelper();
    }
    
    // Draw a string helper at the bottom of the screen
    function drawStringHelper() {
        const stringNames = Object.keys(stringFrequencies);
        const boxWidth = canvas.width / stringNames.length;
        const boxHeight = 60;
        const y = canvas.height - boxHeight;
        
        ctx.save();
        ctx.globalAlpha = 0.7;
        
        // Draw each string box
        stringNames.forEach((stringName, index) => {
            const x = index * boxWidth;
            const isActive = stringName === gameState.lastNote;
            
            // Background
            ctx.fillStyle = isActive ? 'rgba(34, 197, 94, 0.6)' : 'rgba(15, 23, 42, 0.6)';
            ctx.fillRect(x, y, boxWidth, boxHeight);
            
            // Border
            ctx.strokeStyle = isActive ? 'rgba(34, 197, 94, 1)' : 'rgba(96, 165, 250, 0.5)';
            ctx.lineWidth = isActive ? 3 : 1;
            ctx.strokeRect(x, y, boxWidth, boxHeight);
            
            // String name
            ctx.fillStyle = 'white';
            ctx.font = '16px Orbitron, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(stringDisplayNames[stringName] || stringName, x + boxWidth / 2, y + 20);
            
            // Frequency
            ctx.font = '14px Orbitron, sans-serif';
            ctx.fillText(`${stringFrequencies[stringName].toFixed(1)} Hz`, x + boxWidth / 2, y + 40);
        });
        
        ctx.restore();
    }
    
    // Create ship impact effect when hit by meteor
    function createShipImpact() {
        // Visual effect
        createExplosion(gameState.rocketPosition, canvas.height / 2, 30);
        
        // Play damage sound
        if (!audioContext) return;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(100, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.5);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.5);
    }
    
    // Play level up sound
    function playLevelUpSound() {
        if (!audioContext) return;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime + 0.2);
        oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.4);
        
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.6);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.6);
    }
    
    // Initialize mission timer
    let missionStartTime = 0;
    function updateMissionTimer() {
        if (!gameState.isRunning) return;
        
        const elapsed = Date.now() - missionStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        
        if (elements.missionTimer) {
            elements.missionTimer.textContent = timeString;
        }
        
        requestAnimationFrame(updateMissionTimer);
    }
    
    // Start the game
    function startGame() {
        // Only start if we have access to audio
        if (!audioContext) {
            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                if (audioContext.state === 'suspended') {
                    audioContext.resume();
                }
            } catch (e) {
                console.error("Failed to create audio context: ", e);
                elements.status.textContent = "ERROR: AUDIO CONTEXT CREATION FAILED";
                return;
            }
        }
        
        // Request microphone access
        navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false,
                latency: 0
            }
        })
        .then(stream => {
            analyser = audioContext.createAnalyser();
            analyser.fftSize = CONSTANTS.FFT_SIZE;
            
            source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            
            // Reset game state
            gameState.isRunning = true;
            gameState.score = 0;
            gameState.lives = 3;
            gameState.level = 1;
            gameState.meteors = [];
            gameState.lastMeteorTime = Date.now();
            gameState.meteorInterval = 3000;
            gameState.meteorSpeed = 2;
            gameState.laserBeams = [];
            gameState.rocketY = canvas.height / 2; // Initialize rocket Y position
            
            // Update UI
            elements.scoreDisplay.textContent = gameState.score;
            elements.livesDisplay.textContent = gameState.lives;
            elements.button.textContent = "ABORT MISSION";
            elements.missionStatus.textContent = "MISSION ACTIVE";
            elements.status.textContent = "DEFEND AGAINST METEORS!";
            
            // Initialize stars
            initStars();
            
            // Start mission timer
            missionStartTime = Date.now();
            requestAnimationFrame(updateMissionTimer);
            
            // Start game loop
            requestAnimationFrame(gameLoop);
            
            // Start frequency detection
            detectFrequency();
            
            // Play start sound
            playStartSound();
        })
        .catch(err => {
            console.error("Failed to get microphone access: ", err);
            elements.status.textContent = "ERROR: MICROPHONE ACCESS DENIED";
            activateDemoMode();
        });
    }

    // Stop the game
    function stopGame(message = "MISSION ABORTED") {
        gameState.isRunning = false;
        
        if (source) {
            source.disconnect();
            source = null;
        }
        
        // Update UI
        elements.button.textContent = "START MISSION";
        elements.missionStatus.textContent = "MISSION STANDBY";
        elements.status.textContent = message;
        
        // Play game over sound if appropriate
        if (message.includes("GAME OVER")) {
            playGameOverSound();
        }
    }
    
    // Sound Effects
    function playStartSound() {
        if (!audioContext) return;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.5);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.5);
    }
    
    function playGameOverSound() {
        if (!audioContext) return;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(110, audioContext.currentTime + 1.5);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.5);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 1.5);
    }
    
    // Update the game loop to include the new effects
    function gameLoop() {
        if (!gameState.isRunning) return;
        
        updateGame();
        updateScorePopups();
        drawGame();
        drawScorePopups();
        
        requestAnimationFrame(gameLoop);
    }
    
    // Activate demo mode for testing without microphone
    function activateDemoMode() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = CONSTANTS.FFT_SIZE;
        
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.5;
        
        // Create oscillator for demo notes
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(82.41, audioContext.currentTime); // E2
        
        const demoNotes = [
            { freq: 82.41, duration: 3000 },  // E2
            { freq: 110.00, duration: 3000 }, // A2
            { freq: 146.83, duration: 3000 }, // D3
            { freq: 196.00, duration: 3000 }, // G3
            { freq: 246.94, duration: 3000 }, // B3
            { freq: 329.63, duration: 3000 }  // E4
        ];
        
        let noteIndex = 0;
        
        // Function to cycle through demo notes
        function playNextNote() {
            if (!gameState.isRunning) return;
            
            const note = demoNotes[noteIndex];
            oscillator.frequency.setValueAtTime(note.freq, audioContext.currentTime);
            
            noteIndex = (noteIndex + 1) % demoNotes.length;
            setTimeout(playNextNote, note.duration);
        }
        
        oscillator.connect(gainNode);
        gainNode.connect(analyser);
        oscillator.start();
        
        // Start the demo sequence
        playNextNote();
        
        // Reset game state
        gameState.isRunning = true;
        gameState.score = 0;
        gameState.lives = 3;
        gameState.level = 1;
        gameState.meteors = [];
        gameState.lastMeteorTime = Date.now();
        gameState.meteorInterval = 3000;
        gameState.meteorSpeed = 2;
        gameState.laserBeams = [];
        
        // Update UI
        elements.scoreDisplay.textContent = gameState.score;
        elements.livesDisplay.textContent = gameState.lives;
        elements.button.textContent = "ABORT MISSION";
        elements.missionStatus.textContent = "DEMO MODE ACTIVE";
        elements.status.textContent = "DEMO MODE: STRINGS WILL AUTO-PLAY";
        
        // Initialize stars
        initStars();
        
        // Start mission timer
        missionStartTime = Date.now();
        requestAnimationFrame(updateMissionTimer);
        
        // Start game loop
        requestAnimationFrame(gameLoop);
        
        // Start frequency detection
        detectFrequency();
        
        // Play start sound
        playStartSound();
    }
    
    // Detect frequency from audio input and process it
    function detectFrequency() {
        if (!gameState.isRunning) return;
        
        requestAnimationFrame(detectFrequency);
        
        if (!analyser) return;
        
        const buffer = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buffer);
        
        const rms = Math.sqrt(buffer.reduce((acc, val) => acc + val * val, 0) / buffer.length);
        updateVolumeIndicator(rms);
        
        if (rms > CONSTANTS.MIN_AMPLITUDE) {
            const frequency = findPitch(buffer, audioContext.sampleRate);
            
            if (frequency && !isNaN(frequency) && isFinite(frequency)) {
                processDetectedFrequency(frequency);
            }
        }
    }

    // Process the detected frequency
    function processDetectedFrequency(frequency) {
        // Find closest note
        let closestNote = '';
        let minCents = Infinity;
        
        for (const [note, noteFreq] of Object.entries(stringFrequencies)) {
            const centsOff = 1200 * Math.log2(frequency / noteFreq);
            if (Math.abs(centsOff) < Math.abs(minCents)) {
                minCents = centsOff;
                closestNote = note;
            }
        }
        
        // Only accept if close enough to a target frequency
        if (Math.abs(minCents) < CONSTANTS.FREQUENCY_TOLERANCE) {
            // Update UI displays
            if (elements.currentNote) {
                elements.currentNote.textContent = closestNote;
            }
            if (elements.frequency) {
                elements.frequency.textContent = `${frequency.toFixed(1)} Hz`;
            }
            
            // Set the current note in game state
            gameState.currentNote = stringDisplayNames[closestNote] || closestNote;
            
            // Important: Only check if we haven't detected this note recently (debounce)
            const now = Date.now();
            if (closestNote && 
                (gameState.lastNote !== closestNote || now - gameState.lastNoteTime > 500)) {
                
                // Fire laser immediately at any meteor with matching string
                let foundMatchingMeteor = false;
                
                for (let i = 0; i < gameState.meteors.length; i++) {
                    const meteor = gameState.meteors[i];
                    if (!meteor.destroyed && meteor.string === closestNote) {
                        // We found a matching meteor - fire laser directly at it
                        fireDirectLaser(closestNote, meteor);
                        foundMatchingMeteor = true;
                        
                        // Store the time to prevent rapid re-firing
                        gameState.lastNoteTime = now;
                        break;
                    }
                }
                
                gameState.lastNote = closestNote;
            }
        }
    }

    // Add a new function for direct laser targeting
    function fireDirectLaser(stringName, targetMeteor) {
        // Get the position of the rocket and the meteor
        const rocketX = gameState.rocketPosition + 40; // Front of the rocket
        
        // Create a laser aimed directly at the meteor
        const laser = {
            startX: rocketX,
            startY: gameState.rocketY,
            endX: targetMeteor.x,
            endY: targetMeteor.y,
            targetString: stringName,
            timestamp: Date.now()
        };
        
        gameState.laserBeams.push(laser);
        
        // Play laser sound
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Quick volume ramp for a laser sound
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.2);
    }

    // Update the volume level indicator
    function updateVolumeIndicator(rms) {
        if (!elements.volumeLevel) return;
        
        // Convert RMS to percentage (0-100%)
        const volume = Math.min(100, Math.max(0, rms * 400));
        
        // Update volume level display
        elements.volumeLevel.style.width = `${volume}%`;
        
        // Add visual feedback based on signal strength
        if (volume > 80) {
            elements.volumeLevel.style.backgroundColor = 'var(--warning)';
        } else if (volume > 10) {
            elements.volumeLevel.style.backgroundColor = 'var(--primary)';
        } else {
            elements.volumeLevel.style.backgroundColor = 'var(--text-secondary)';
        }
    }

    // Find the pitch in an audio buffer
    function findPitch(buffer, sampleRate) {
        const bufferSize = buffer.length;
        const correlations = new Array(bufferSize).fill(0);
        
        // Calculate autocorrelation
        for (let i = 0; i < bufferSize; i++) {
            for (let j = 0; j < bufferSize - i; j++) {
                correlations[i] += buffer[j] * buffer[j + i];
            }
        }
        
        // Normalize correlations
        const zeroCrossing = correlations[0];
        if (zeroCrossing <= 0) return null;
        
        for (let i = 1; i < bufferSize; i++) {
            correlations[i] = correlations[i] / zeroCrossing;
        }
        
        // Focus on guitar frequency range (70Hz - 350Hz)
        const minPeriod = Math.floor(sampleRate / 350);
        const maxPeriod = Math.ceil(sampleRate / 70);
        
        let bestPeriod = 0;
        let bestCorrelation = 0;
        
        for (let i = minPeriod; i < maxPeriod; i++) {
            if (correlations[i] > correlations[i-1] && 
                correlations[i] > correlations[i+1] && 
                correlations[i] > bestCorrelation) {
                
                // Check if this is a fundamental frequency, not a harmonic
                let isHarmonic = false;
                for (let factor = 2; factor <= 4; factor++) {
                    const harmonicIdx = Math.round(i / factor);
                    if (harmonicIdx >= minPeriod && 
                        correlations[harmonicIdx] > correlations[i] * 1.3) {
                        isHarmonic = true;
                        break;
                    }
                }
                
                if (!isHarmonic) {
                    bestCorrelation = correlations[i];
                    bestPeriod = i;
                }
            }
        }
        
        if (bestPeriod > 0 && bestCorrelation > 0.3) {
            const frequency = sampleRate / bestPeriod;
            return frequency >= 70 && frequency <= 350 ? frequency : null;
        }
        
        return null;
    }
    
    // Handle tuning selection change
    elements.tuningSelect.addEventListener('change', function() {
        currentTuning = this.value;
        
        if (tunings[currentTuning]) {
            console.log(`Switching to ${tunings[currentTuning].name} tuning`);
            stringFrequencies = tunings[currentTuning].frequencies;
            
            // Update string display names based on tuning
            if (currentTuning === "standard") {
                Object.assign(stringDisplayNames, {
                    "E2": "E (low)",
                    "A2": "A",
                    "D3": "D",
                    "G3": "G",
                    "B3": "B",
                    "E4": "e (high)"
                });
            } else if (currentTuning === "half-step") {
                Object.assign(stringDisplayNames, {
                    "Eb2": "Eb (low)",
                    "Ab2": "Ab",
                    "Db3": "Db",
                    "Gb3": "Gb",
                    "Bb3": "Bb",
                    "Eb4": "eb (high)"
                });
            } else if (currentTuning === "dropD") {
                Object.assign(stringDisplayNames, {
                    "D2": "D (low)",
                    "A2": "A",
                    "D3": "D",
                    "G3": "G",
                    "B3": "B",
                    "E4": "e (high)"
                });
            }
            
            elements.status.textContent = `TUNING SWITCHED TO ${tunings[currentTuning].name.toUpperCase()}`;
        } else {
            console.error('Tuning not defined:', currentTuning);
        }
    });
    
    // Add keyboard controls for testing (for developers)
    document.addEventListener('keydown', (event) => {
        if (!gameState.isRunning) return;
        
        // Map keys to string frequencies
        const keyMap = {
            '1': 'E2',  // Low E
            '2': 'A2',  // A
            '3': 'D3',  // D
            '4': 'G3',  // G
            '5': 'B3',  // B
            '6': 'E4'   // High E
        };
        
        if (keyMap[event.key]) {
            // Simulate playing this string
            gameState.currentNote = stringDisplayNames[keyMap[event.key]] || keyMap[event.key];
            gameState.lastNote = keyMap[event.key];
            fireLaser(keyMap[event.key]);
        }
    });
    
    // Add tutorial popup system for helping new players
    const tutorials = [
        {
            id: 'welcome',
            title: 'WELCOME GUITAR CADET!',
            content: 'In this game, you\'ll learn guitar string names by destroying space meteors! Pluck the string shown on each meteor to fire a laser and destroy it.',
            showOnStart: true
        },
        {
            id: 'strings',
            title: 'GUITAR STRING GUIDE',
            content: 'The standard guitar tuning is EADGBE, from the lowest (thickest) string to the highest (thinnest). Use the guide at the bottom of the screen to help you!',
            showAfterSeconds: 5
        },
        {
            id: 'levels',
            title: 'LEVEL UP SYSTEM',
            content: 'As you score points, you\'ll level up! Each level increases the speed and frequency of meteors, but also increases your score multiplier!',
            showAfterScore: 500
        }
    ];
    
    const shownTutorials = {};
    
    function checkTutorials() {
        if (!gameState.isRunning) return;
        
        const now = Date.now();
        const elapsedSeconds = (now - missionStartTime) / 1000;
        
        tutorials.forEach(tutorial => {
            if (shownTutorials[tutorial.id]) return;
            
            let shouldShow = false;
            
            if (tutorial.showOnStart && elapsedSeconds > 1) {
                shouldShow = true;
            }
            
            if (tutorial.showAfterSeconds && elapsedSeconds > tutorial.showAfterSeconds) {
                shouldShow = true;
            }
            
            if (tutorial.showAfterScore && gameState.score >= tutorial.showAfterScore) {
                shouldShow = true;
            }
            
            if (shouldShow) {
                showTutorial(tutorial);
                shownTutorials[tutorial.id] = true;
            }
        });
        
        if (gameState.isRunning) {
            requestAnimationFrame(checkTutorials);
        }
    }
    
    function showTutorial(tutorial) {
        // Create tutorial element
        const tutorialElement = document.createElement('div');
        tutorialElement.className = 'tutorial-popup';
        tutorialElement.innerHTML = `
            <h3>${tutorial.title}</h3>
            <p>${tutorial.content}</p>
            <button class="tutorial-close">GOT IT!</button>
        `;
        
        // Add to page
        document.body.appendChild(tutorialElement);
        
        // Close button
        const closeButton = tutorialElement.querySelector('.tutorial-close');
        closeButton.addEventListener('click', () => {
            document.body.removeChild(tutorialElement);
        });
    }
    
    // Initialize the game
    elements.button.addEventListener('click', function() {
        if (gameState.isRunning) {
            stopGame();
        } else {
            startGame();
            // Start tutorial system
            setTimeout(() => {
                requestAnimationFrame(checkTutorials);
            }, 1000);
        }
    });
    
    // Display welcome message
    elements.status.textContent = "WELCOME TO GUITAR SPACE DEFENDER! PRESS START TO BEGIN";
    
    // Initialize the tutorial button if exists
    const tutorialButton = document.getElementById('tutorialButton');
    if (tutorialButton) {
        tutorialButton.addEventListener('click', () => {
            showTutorial(tutorials[0]); // Show the welcome tutorial
        });
    }
    
    // Handle window resize
    window.addEventListener('resize', () => {
        resizeCanvas();
        
        // Adjust meteor positions if needed
        gameState.meteors.forEach(meteor => {
            if (meteor.y > canvas.height) {
                meteor.y = canvas.height - meteor.size;
            }
        });
    });

    // Find the nearest meteor
    function findNearestMeteor() {
        let nearestMeteor = null;
        let minDistance = Infinity;
        
        gameState.meteors.forEach(meteor => {
            if (!meteor.destroyed) {
                // Calculate distance using x position (since we only care about horizontal alignment)
                const distance = meteor.x - gameState.rocketPosition;
                
                if (distance > 0 && distance < minDistance) {
                    minDistance = distance;
                    nearestMeteor = meteor;
                }
            }
        });
        
        return nearestMeteor;
    }
});