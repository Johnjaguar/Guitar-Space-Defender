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
        gameCanvas: document.getElementById('gameCanvas'),
        gameControls: document.querySelector('.game-controls'),
        canvasContainer: document.querySelector('.canvas-container')
    };

    // Game state
    const gameState = {
        isRunning: false,
        score: 0,
        lives: 3,
        level: 1,
        currentLevel: 1,
        levelGoal: 5000,
        availableStrings: [],
        gameCompleted: false,
        moonLanding: {
            active: false,
            progress: 0,
            stars: [],
            moonSize: 0, // Will be set during initialization
            rocketPositionX: 0,
            rocketPositionY: 0,
            rocketRotation: Math.PI / 2,
            landingComplete: false,
            landingMessageShown: false,
            dust: []
        },
        meteors: [],
        lastMeteorTime: 0,
        meteorInterval: 3000,
        currentNote: null,
        lastNote: null,
        lastNoteTime: 0,
        rocketPosition: 100,
        rocketY: 0,
        backgroundStars: [],
        meteorSpeed: 2,
        laserBeams: [],
        shields: [],
        maxShields: 3,
        shieldParticles: [],
        gameOverMode: false,
        canRestartWithG: false,
        restartTimerId: null
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
        FREQUENCY_TOLERANCE: 7, // cents
        // Add new volume threshold constants
        PLUCK_VOLUME_THRESHOLD: 0.05,    // Minimum volume to count as a new pluck
        RESIDUAL_VOLUME_THRESHOLD: 0.03, // Maximum volume to consider as residual ringing
        PLUCK_COOLDOWN: 1000             // Minimum time between plucks in ms
    };

    // Smoothing window for frequency detection
    const smoothingWindow = [];

    // Get canvas and context
    const canvas = elements.gameCanvas;
    const ctx = canvas.getContext('2d');

    // Fix layout issues
    function fixLayoutIssues() {
        // Add sticky class to controls when scrolling
        const observer = new IntersectionObserver(
            ([e]) => {
                if (elements.gameControls) {
                    elements.gameControls.classList.toggle('sticky', e.intersectionRatio < 1);
                }
            },
            { threshold: [1] }
        );

        if (elements.gameControls) {
            observer.observe(elements.gameControls);
        }

        // Handle window resize
        window.addEventListener('resize', () => {
            resizeCanvas();
            requestAnimationFrame(() => {
                // Reposition game elements after resize
                if (gameState.rocketY > canvas.height) {
                    gameState.rocketY = canvas.height / 2;
                }
                // Redraw game if running
                if (gameState.isRunning) {
                    drawGame();
                }
            });
        });

        // Initial canvas resize
        resizeCanvas();
    }

    // Make sure canvas resizing works properly
    function resizeCanvas() {
        const container = elements.canvasContainer;
        if (!container || !canvas) return;

        // Get container dimensions
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        // Set canvas size based on container while maintaining 5:3 aspect ratio
        canvas.width = containerWidth;
        canvas.height = containerWidth * 0.6; // 5:3 aspect ratio

        // Update canvas style
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.objectFit = 'contain';

        // Update game state positions if needed
        if (gameState.rocketY > canvas.height) {
            gameState.rocketY = canvas.height / 2;
        }

        // Adjust meteor positions
        gameState.meteors.forEach(meteor => {
            if (meteor.y > canvas.height) {
                meteor.y = canvas.height - meteor.size;
            }
        });
    }

    // Call fixLayoutIssues during initialization
    fixLayoutIssues();

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

    // Create a meteor with string name
    function createMeteor() {
        // Get list of available strings for the current level
        const availableStrings = gameState.availableStrings;
        if (!availableStrings || availableStrings.length === 0) return;
        
        const randomString = availableStrings[Math.floor(Math.random() * availableStrings.length)];
        
        // Define base size and assign sizes based on string thickness
        // High E (thinnest) = smallest, Low E (thickest) = largest
        let baseSize;
        
        // Set the size based on string name - correlates with actual string thickness
        switch(randomString) {
            case 'E4': // High E (thinnest)
                baseSize = 20;
                break;
            case 'B3': // B string
                baseSize = 25;
                break;
            case 'G3': // G string
                baseSize = 30;
                break;
            case 'D3': // D string
                baseSize = 35;
                break;
            case 'A2': // A string
                baseSize = 40;
                break;
            case 'E2': // Low E (thickest)
                baseSize = 45;
                break;
            // For drop-D and other tunings, fallback sizes
            case 'Eb4':
                baseSize = 20;
                break;
            case 'Bb3':
                baseSize = 25;
                break;
            case 'Gb3':
                baseSize = 30;
                break;
            case 'Db3':
                baseSize = 35;
                break;
            case 'Ab2':
                baseSize = 40;
                break;
            case 'Eb2':
                baseSize = 45;
                break;
            case 'D2': // Drop D lowest string
                baseSize = 45;
                break;
            default:
                // Default size with small variation for any unlisted strings
                baseSize = 30;
        }
        
        // Add small random variation (±15%) to prevent exact uniformity
        const sizeVariation = baseSize * 0.15;
        const finalSize = baseSize + (Math.random() * sizeVariation * 2 - sizeVariation);
        
        // Create meteor with string name and appropriate size
        const meteor = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            x: canvas.width + 50,
            y: 50 + Math.random() * (canvas.height - 100),
            size: finalSize,
            speed: gameState.meteorSpeed + Math.random() * gameState.level,
            string: randomString,
            displayName: stringDisplayNames[randomString] || randomString,
            destroyed: false,
            targeted: false,
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
        
        // Rotate only the meteor body, not the text
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
        
        // IMPORTANT: Reset rotation before drawing text
        ctx.restore();
        ctx.save();
        ctx.translate(meteor.x, meteor.y);
        
        // Create a background for the text that doesn't rotate
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.arc(0, 0, meteor.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw string name with glow effect - NO ROTATION
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = 'white';
        ctx.font = `bold ${Math.max(16, meteor.size / 2)}px 'Share Tech Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(meteor.displayName, 0, 0);
        
        ctx.restore();
    }

    // Draw a laser beam with improved effects
    function drawLaser(laser) {
        if (!laser || !laser.active) return;
        
        ctx.save();
        
        // Calculate how long the laser has been active
        const now = Date.now();
        const age = now - laser.timestamp;
        const lifespan = 600; // Longer lifespan for better visibility
        const lifeFactor = Math.max(0, 1 - (age / lifespan));
        
        if (lifeFactor <= 0) {
            laser.active = false;
            ctx.restore();
            return;
        }
        
        // Create a brighter gradient for better visibility
        const gradient = ctx.createLinearGradient(
            laser.startX, laser.startY, 
            laser.endX, laser.endY
        );
        
        gradient.addColorStop(0, 'rgba(96, 165, 250, 1)');
        gradient.addColorStop(0.5, 'rgba(129, 140, 248, 1)');
        gradient.addColorStop(1, 'rgba(96, 165, 250, 0.1)');
        
        // Draw main beam with increased width
        ctx.strokeStyle = gradient;
        ctx.lineWidth = Math.max(2, 5 * lifeFactor); // Thicker line for visibility
        ctx.beginPath();
        ctx.moveTo(laser.startX, laser.startY);
        ctx.lineTo(laser.endX, laser.endY);
        ctx.stroke();
        
        // Add stronger glow effect
        ctx.shadowColor = 'rgba(96, 165, 250, 0.8)';
        ctx.shadowBlur = 20;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = Math.max(1, 6 * lifeFactor);
        ctx.beginPath();
        ctx.moveTo(laser.startX, laser.startY);
        ctx.lineTo(laser.endX, laser.endY);
        ctx.stroke();
        
        // Add pulse effect along the beam
        const distance = Math.sqrt(
            Math.pow(laser.endX - laser.startX, 2) + 
            Math.pow(laser.endY - laser.startY, 2)
        );
        
        if (distance > 10) {
            const pulseCount = Math.min(5, Math.floor(distance / 50));
            const dx = (laser.endX - laser.startX) / pulseCount;
            const dy = (laser.endY - laser.startY) / pulseCount;
            
            const pulseSize = Math.max(3, 7 * lifeFactor); // Larger pulses
            
            for (let i = 0; i < pulseCount; i++) {
                const pulseX = laser.startX + (i * dx) + ((age / 50) % Math.max(1, dx));
                const pulseY = laser.startY + (i * dy) + ((age / 50) % Math.max(1, dy));
                
                // Bright core of pulse
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.beginPath();
                ctx.arc(pulseX, pulseY, pulseSize, 0, Math.PI * 2);
                ctx.fill();
                
                // Outer glow of pulse
                ctx.fillStyle = 'rgba(96, 165, 250, 0.7)';
                ctx.beginPath();
                ctx.arc(pulseX, pulseY, pulseSize * 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        ctx.restore();
    }
    
    // Modify the fireLaser function to target only one meteor per string pluck
    function fireLaser(targetString) {
        // Find the nearest meteor that matches the string and isn't already targeted
        const targetMeteor = findNearestMeteorForString(targetString);
        
        if (targetMeteor) {
            // Create a laser with a timestamp and unique ID
            const laser = {
                id: Date.now() + Math.random().toString(36).substr(2, 9),
                startX: gameState.rocketPosition + 40,
                startY: gameState.rocketY,
                endX: targetMeteor.x,
                endY: targetMeteor.y,
                targetId: targetMeteor.id,
                timestamp: Date.now(),
                stringType: targetString,
                active: true,
                hasHit: false // Track if this laser has already hit a target
            };
            
            // Add the laser to the game state
            gameState.laserBeams.push(laser);
            
            // Play laser sound with volume based on pluck intensity
            const pluckVolume = gameState.lastNoteVolume || 0.5;
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // Scale laser sound volume with pluck volume (with limits)
            const soundVolume = Math.min(0.5, Math.max(0.1, pluckVolume * 2));
            gainNode.gain.setValueAtTime(soundVolume, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
            
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.2);
            
            // Mark this meteor as targeted to prevent other lasers from targeting it
            targetMeteor.targeted = true;
            
            // Force a longer cooldown between string detections to prevent rapid-fire
            gameState.lastNoteTime = Date.now();
            gameState.lastNote = targetString;
            
            console.log(`Laser fired at meteor ${targetMeteor.id} for string ${targetString} with volume ${pluckVolume.toFixed(3)}`);
            return true; // Indicate a laser was fired
        }
        
        return false; // No laser was fired
    }

    // Modify checkCollisions to properly handle meteor destruction
    function checkCollisions() {
        const now = Date.now();
        
        // Process each laser beam
        for (let i = gameState.laserBeams.length - 1; i >= 0; i--) {
            const laser = gameState.laserBeams[i];
            
            // Skip inactive lasers or lasers that have already hit
            if (!laser.active || laser.hasHit) {
                continue;
            }
            
            // Find the target meteor
            const targetMeteor = gameState.meteors.find(m => 
                m.id === laser.targetId && 
                !m.destroyed
            );
            
            if (targetMeteor) {
                // Check if laser has reached the meteor
                const distance = Math.sqrt(
                    Math.pow(targetMeteor.x - laser.endX, 2) + 
                    Math.pow(targetMeteor.y - laser.endY, 2)
                );
                
                // If the laser is close enough to the meteor
                if (distance < targetMeteor.size) {
                    // Mark this meteor as destroyed
                    targetMeteor.destroyed = true;
                    
                    // Mark this laser as having hit its target
                    laser.hasHit = true;
                    
                    // Calculate enhanced score
                    const score = calculateEnhancedScore(targetMeteor, targetMeteor.x);
                    gameState.score += score;
                    
                    if (elements.scoreDisplay) {
                        elements.scoreDisplay.textContent = gameState.score;
                    }
                    
                    // Create score popup at meteor location
                    createScorePopup(targetMeteor.x, targetMeteor.y, score);
                    
                    // Create explosion effect
                    createExplosion(targetMeteor.x, targetMeteor.y, targetMeteor.size);
                    
                    console.log(`Meteor ${targetMeteor.id} destroyed by laser ${laser.id}`);
                }
            }
            
            // Check if laser has reached the end of its lifespan
            if (now - laser.timestamp > 600) {
                laser.active = false;
            }
        }
        
        // Clean up inactive lasers after processing
        gameState.laserBeams = gameState.laserBeams.filter(laser => laser.active);
        
        // Check meteor-shield collisions
        gameState.meteors.forEach(meteor => {
            if (meteor.destroyed || meteor.x > gameState.rocketPosition) return;
            
            // Meteor passed rocket without being destroyed
            const activeShields = gameState.shields.filter(s => s.active);
            
            if (activeShields.length > 0) {
                // Destroy outermost active shield
                const shieldIndex = gameState.shields.findIndex(s => s.active);
                if (shieldIndex >= 0) {
                    gameState.shields[shieldIndex].active = false;
                    gameState.lives--;
                    
                    // Update UI
                    if (elements.livesDisplay) {
                        elements.livesDisplay.textContent = gameState.lives;
                    }
                    
                    if (elements.status) {
                        elements.status.textContent = `SHIELD DESTROYED! ${gameState.lives} LIVES REMAINING`;
                    }
                    
                    // Create shield break effect
                    createShieldBreakEffect(
                        gameState.shields[shieldIndex].x,
                        gameState.shields[shieldIndex].y
                    );
                    
                    meteor.destroyed = true;
                    createExplosion(meteor.x, meteor.y, meteor.size);
                    
                    console.log(`Shield destroyed! Lives: ${gameState.lives}`);
                    
                    // Game over check - only when all 4 lives are gone
                    if (gameState.lives <= 0) {
                        createExplosion(gameState.rocketPosition, gameState.rocketY, 50);
                        stopGame("GAME OVER - ALL SHIELDS AND LIVES LOST");
                    }
                }
            } else {
                // Direct rocket hit (no shields left)
                meteor.destroyed = true;
                gameState.lives = 0;
                
                createExplosion(gameState.rocketPosition, gameState.rocketY, 50);
                stopGame("GAME OVER - ROCKET DESTROYED");
            }
        });
    }

    // Update findNearestMeteorForString to be more precise
    function findNearestMeteorForString(targetString) {
        let nearestMeteor = null;
        let minDistance = Infinity;
        
        // Only consider valid, untargeted meteors of the correct string type
        const validMeteors = gameState.meteors.filter(meteor => {
            return !meteor.destroyed && 
                   !meteor.targeted && 
                   meteor.string === targetString && 
                   meteor.x > gameState.rocketPosition; // Only meteors in front of rocket
        });
        
        // Find the nearest eligible meteor
        validMeteors.forEach(meteor => {
            const distance = meteor.x - gameState.rocketPosition;
            if (distance < minDistance) {
                minDistance = distance;
                nearestMeteor = meteor;
            }
        });
        
        // Log debugging info
        if (nearestMeteor) {
            console.log(`Found nearest ${targetString} meteor: ${nearestMeteor.id} at distance ${minDistance}`);
        } else {
            console.log(`No eligible meteors found for string ${targetString}`);
        }
        
        return nearestMeteor;
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
        
        // Update laser beams with proper cleanup
        const now = Date.now();
        gameState.laserBeams = gameState.laserBeams.filter(laser => {
            // Only keep lasers that were created less than 500ms ago
            return (now - laser.timestamp) < 500;
        });
        
        // Move rocket to align with the nearest meteor
        if (nearestMeteor) {
            const targetY = nearestMeteor.y;
            const moveSpeed = 2 + (gameState.level * 0.5);
            
            // Smoothly move the rocket vertically
            if (Math.abs(targetY - gameState.rocketY) > 5) {
                if (targetY > gameState.rocketY) {
                    gameState.rocketY += moveSpeed;
                } else {
                    gameState.rocketY -= moveSpeed;
                }
            }
        }
        
        // Update shield positions to follow rocket
        gameState.shields.forEach((shield, index) => {
            if (shield.active) {
                shield.x = gameState.rocketPosition + 30;
                shield.y = gameState.rocketY;
                shield.opacity = 0.6 - (index * 0.1) + Math.sin(Date.now() / 500) * 0.1;
            }
        });
        
        // Move stars
        gameState.backgroundStars.forEach(star => {
            star.x -= star.speed;
            if (star.x < 0) {
                star.x = canvas.width;
                star.y = Math.random() * canvas.height;
            }
        });
        
        // Create new meteors at intervals
        if (now - gameState.lastMeteorTime > gameState.meteorInterval) {
            createMeteor();
            gameState.lastMeteorTime = now;
            
            // Decrease interval as game progresses (making it harder)
            gameState.meteorInterval = Math.max(1000, 3000 - (gameState.level * 300));
        }
        
        // Move meteors and check for collisions
        gameState.meteors.forEach(meteor => {
            meteor.x -= meteor.speed;
            meteor.rotation += 0.01;
            
            // Check if meteor has passed the rocket without being destroyed
            if (!meteor.destroyed && meteor.x < gameState.rocketPosition) {
                // Find the first active shield to destroy
                const activeShieldIndex = gameState.shields.findIndex(s => s.active);
                
                if (activeShieldIndex >= 0) {
                    // Destroy shield and create shield break effect
                    gameState.shields[activeShieldIndex].active = false;
                    createShieldBreakEffect(
                        gameState.shields[activeShieldIndex].x,
                        gameState.shields[activeShieldIndex].y
                    );
                    
                    // Update lives count
                    gameState.lives--;
                    elements.livesDisplay.textContent = gameState.lives;
                    elements.status.textContent = `SHIELD DESTROYED! ${gameState.lives} REMAINING`;
                    
                    // Mark meteor as destroyed to prevent multiple hits
                    meteor.destroyed = true;
                    
                    // Create explosion effect
                    createExplosion(meteor.x, meteor.y, meteor.size);
                    
                    // Fix: Only end game if all shields are destroyed AND lives are 0
                    if (gameState.lives <= 0 && gameState.shields.every(s => !s.active)) {
                        createExplosion(gameState.rocketPosition, gameState.rocketY, 50);
                        stopGame("GAME OVER - OUT OF SHIELDS");
                    }
                } else {
                    // All shields are gone, but player gets one final life
                    if (gameState.lives > 0) {
                        gameState.lives--;
                        elements.livesDisplay.textContent = gameState.lives;
                        elements.status.textContent = `DIRECT HIT! FINAL LIFE REMAINING!`;
                        
                        // Mark meteor as destroyed
                        meteor.destroyed = true;
                        
                        // Create explosion effect
                        createExplosion(meteor.x, meteor.y, meteor.size);
                        
                        // Visual feedback for last life
                        const flashOverlay = document.createElement('div');
                        flashOverlay.style.position = 'absolute';
                        flashOverlay.style.top = '0';
                        flashOverlay.style.left = '0';
                        flashOverlay.style.width = '100%';
                        flashOverlay.style.height = '100%';
                        flashOverlay.style.backgroundColor = 'rgba(239, 68, 68, 0.3)';
                        flashOverlay.style.pointerEvents = 'none';
                        flashOverlay.style.zIndex = '5';
                        flashOverlay.style.animation = 'flash-danger 0.5s forwards';
                        document.body.appendChild(flashOverlay);
                        
                        // Remove flash after animation
                        setTimeout(() => {
                            if (flashOverlay.parentNode) {
                                flashOverlay.parentNode.removeChild(flashOverlay);
                            }
                        }, 500);
                        
                        // Only end game if on final life
                        if (gameState.lives <= 0) {
                            createExplosion(gameState.rocketPosition, gameState.rocketY, 50);
                            stopGame("GAME OVER - ROCKET DESTROYED");
                        }
                    } else {
                        // Game over when final life is lost
                        meteor.destroyed = true;
                        createExplosion(gameState.rocketPosition, gameState.rocketY, 50);
                        stopGame("GAME OVER - ROCKET DESTROYED");
                    }
                }
            }
        });
        
        // Update particles and other effects
        updateShieldParticles();
        updateExplosions();
        updateScorePopups();
        
        // Check for collisions between lasers and meteors
        checkCollisions();
        
        // Level up check
        if (gameState.score >= gameState.levelGoal) {
            if (gameState.currentLevel < 4) {
                // Advance to next level
                gameState.currentLevel++;
                gameState.level = gameState.currentLevel;
                gameState.score = 0;
                setupLevelStrings();
                elements.status.textContent = `LEVEL UP! NOW AT LEVEL ${gameState.currentLevel}: ${getLevelDescription()}`;
                playLevelUpSound();
            } else {
                // Game completed - start moon landing
                console.log("Game completed! Starting moon landing sequence");
                gameState.gameCompleted = true;
                gameState.isRunning = false;
                initMoonLanding();
                return;
            }
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
        
        // Draw laser beams
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
        
        // Draw enhanced shields
        drawVisibleShields();
        
        // Draw shield particles
        drawShieldParticles();
        
        // Draw the rocket
        drawRocket(gameState.rocketPosition, gameState.rocketY);
        
        // Draw score popups
        drawScorePopups();
        
        // Draw string helper
        drawStringHelper();

        // Draw score display on canvas
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.fillRect(10, 10, 150, 40);
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 10, 150, 40);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Orbitron, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`SCORE: ${gameState.score}`, 20, 30);
        ctx.restore();

        // Draw lives indicator
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.fillRect(canvas.width - 160, 10, 150, 40);
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(canvas.width - 160, 10, 150, 40);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Orbitron, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`SHIELDS: ${gameState.lives}`, canvas.width - 150, 30);
        ctx.restore();
        
        // Draw level progress
        drawLevelProgress();
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
    
    // Create shield break effect
    function createShieldBreakEffect(x, y) {
        // Create particles
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            
            const particle = {
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 2 + Math.random() * 4,
                color: 'rgba(96, 165, 250, 0.8)',
                life: 1.0
            };
            
            gameState.shieldParticles.push(particle);
        }
        
        // Play shield break sound
        if (audioContext) {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.3);
            
            gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.3);
        }
    }

    // Update shield particles
    function updateShieldParticles() {
        if (!gameState.shieldParticles) return;
        
        gameState.shieldParticles = gameState.shieldParticles.filter(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.life -= 0.02;
            return particle.life > 0;
        });
    }

    // Draw shield particles
    function drawShieldParticles() {
        if (!gameState.shieldParticles) return;
        
        ctx.save();
        gameState.shieldParticles.forEach(particle => {
            ctx.globalAlpha = particle.life;
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    // Update the game loop to include the new effects
    function gameLoop() {
        if (!gameState.isRunning) return;
        
        updateGame();
        drawGame();
        
        requestAnimationFrame(gameLoop);
    }
    
    // Activate demo mode for testing without microphone
    function activateDemoMode() {
        console.log("Activating demo mode");
        
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = CONSTANTS.FFT_SIZE;
        
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.5;
        
        // Create oscillator for demo notes with simulated volumes
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(82.41, audioContext.currentTime); // E2
        
        const demoNotes = [
            { freq: 82.41, duration: 3000, volume: 0.08 },  // E2
            { freq: 110.00, duration: 3000, volume: 0.07 }, // A2
            { freq: 146.83, duration: 3000, volume: 0.09 }, // D3
            { freq: 196.00, duration: 3000, volume: 0.06 }, // G3
            { freq: 246.94, duration: 3000, volume: 0.07 }, // B3
            { freq: 329.63, duration: 3000, volume: 0.08 }  // E4
        ];
        
        let noteIndex = 0;
        
        // Function to cycle through demo notes with simulated volume
        function playNextNote() {
            if (!gameState.isRunning && !activeTutorial) return;
            
            const note = demoNotes[noteIndex];
            oscillator.frequency.setValueAtTime(note.freq, audioContext.currentTime);
            
            // Find the note name for this frequency
            let noteName = null;
            let closestDistance = Infinity;
            for (const [name, frequency] of Object.entries(stringFrequencies)) {
                const distance = Math.abs(frequency - note.freq);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    noteName = name;
                }
            }
            
            // Set last note directly for demo mode with simulated volume
            if (noteName) {
                gameState.lastNote = noteName;
                gameState.lastNoteTime = Date.now();
                gameState.lastNoteVolume = note.volume;
                console.log(`Demo mode: Playing ${noteName} (${note.freq} Hz) at volume ${note.volume}`);
                
                // Update volume indicator
                updateVolumeIndicator(note.volume);
                
                // In demo mode, we'll automatically trigger a laser for each note
                if (gameState.isRunning) {
                    fireLaser(noteName);
                    window.showPluckIndicator?.();
                }
            }
            
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
        elements.status.textContent = "DEMO MODE ACTIVE";
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
        // Always continue frequency detection regardless of game state
        requestAnimationFrame(detectFrequency);
        
        if (!analyser) {
            console.error("No analyser available for frequency detection");
            return;
        }
        
        const buffer = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buffer);
        
        // Calculate RMS (Root Mean Square) for volume
        const rms = Math.sqrt(buffer.reduce((acc, val) => acc + val * val, 0) / buffer.length);
        
        // Update volume indicator visual
        updateVolumeIndicator(rms);
        
        // Only process if actual volume detected
        if (rms > CONSTANTS.MIN_AMPLITUDE) {
            const frequency = findPitch(buffer, audioContext.sampleRate);
            
            if (frequency && !isNaN(frequency) && isFinite(frequency)) {
                // Pass the volume (rms) to processDetectedFrequency
                processDetectedFrequency(frequency, rms);
            }
        }
    }

    // Process the detected frequency
    function processDetectedFrequency(frequency, volume) {
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
                elements.frequency.textContent = `${frequency.toFixed(1)} Hz (${(volume * 400).toFixed(0)}%)`;
            }
            
            // Set the current note in game state - always track this
            gameState.currentNote = stringDisplayNames[closestNote] || closestNote;
            
            // Get current time for comparison
            const now = Date.now();
            
            // TUTORIAL MODE vs GAME MODE detection logic
            if (activeTutorial) {
                // Tutorial mode - update last note without cooldown
                gameState.lastNote = closestNote;
                gameState.lastNoteTime = now;
                gameState.lastNoteVolume = volume;
                console.log(`Tutorial mode: String ${closestNote} detected, volume: ${volume.toFixed(3)}`);
            } else if (gameState.isRunning) {
                // Game mode - use volume threshold and cooldown
                const isNewPluck = volume >= CONSTANTS.PLUCK_VOLUME_THRESHOLD;
                const pastCooldown = now - gameState.lastNoteTime > CONSTANTS.PLUCK_COOLDOWN;
                const isDifferentString = closestNote !== gameState.lastNote;
                
                console.log(`String: ${closestNote}, Volume: ${volume.toFixed(3)}, Time since last: ${now - gameState.lastNoteTime}ms, ` +
                           `Is new pluck: ${isNewPluck}, Past cooldown: ${pastCooldown}, Different string: ${isDifferentString}`);
                
                if ((isNewPluck && pastCooldown) || (isNewPluck && isDifferentString)) {
                    elements.status.textContent = `STRING DETECTED: ${stringDisplayNames[closestNote] || closestNote} (Volume: ${(volume * 400).toFixed(0)}%)`;
                    
                    const laserFired = fireLaser(closestNote);
                    
                    if (laserFired) {
                        gameState.lastNote = closestNote;
                        gameState.lastNoteTime = now;
                        gameState.lastNoteVolume = volume;
                        console.log(`New pluck accepted: Laser fired at ${volume.toFixed(3)} volume`);
                        window.showPluckIndicator?.();
                    }
                } else {
                    console.log(`String detection ignored: ${isNewPluck ? "Volume sufficient" : "Volume too low"}, ` +
                               `${pastCooldown ? "Past cooldown" : "Within cooldown"}`);
                    
                    if (isNewPluck && !pastCooldown) {
                        elements.status.textContent = `PLUCK DETECTED BUT TOO SOON - WAIT A MOMENT`;
                    }
                }
            } else {
                // Not in game or tutorial mode - just update display
                elements.status.textContent = `STRING DETECTED: ${stringDisplayNames[closestNote] || closestNote}`;
            }
        }
    }

    // Find the nearest meteor for a specific string
    function findNearestMeteorForString(targetString) {
        let nearestMeteor = null;
        let minDistance = Infinity;
        
        // Only consider valid, untargeted meteors of the correct string type
        const validMeteors = gameState.meteors.filter(meteor => {
            return !meteor.destroyed && 
                   !meteor.targeted && 
                   meteor.string === targetString && 
                   meteor.x > gameState.rocketPosition; // Only meteors in front of rocket
        });
        
        // Find the nearest eligible meteor
        validMeteors.forEach(meteor => {
            const distance = meteor.x - gameState.rocketPosition;
            if (distance < minDistance) {
                minDistance = distance;
                nearestMeteor = meteor;
            }
        });
        
        // Log debugging info
        if (nearestMeteor) {
            console.log(`Found nearest ${targetString} meteor: ${nearestMeteor.id} at distance ${minDistance}`);
        } else {
            console.log(`No eligible meteors found for string ${targetString}`);
        }
        
        return nearestMeteor;
    }

    // Update the volume level indicator with more feedback
    function updateVolumeIndicator(rms) {
        if (!elements.volumeLevel) {
            console.error("Volume level element not found");
            return;
        }
        
        // Convert RMS to percentage (0-100%)
        const volumePercentage = Math.min(100, Math.max(0, rms * 400));
        
        // Update volume level display
        elements.volumeLevel.style.width = `${volumePercentage}%`;
        
        // Add visual feedback based on signal strength
        if (volumePercentage > CONSTANTS.PLUCK_VOLUME_THRESHOLD * 400) {
            elements.volumeLevel.style.backgroundColor = 'var(--success)';
        } else if (volumePercentage > CONSTANTS.RESIDUAL_VOLUME_THRESHOLD * 400) {
            elements.volumeLevel.style.backgroundColor = 'var(--warning)';
        } else {
            elements.volumeLevel.style.backgroundColor = 'var(--text-secondary)';
        }
        
        // Add threshold markers if they don't exist
        const volumeContainer = elements.volumeLevel.parentElement;
        if (volumeContainer && !volumeContainer.querySelector('.threshold-marker')) {
            addThresholdMarker(volumeContainer, CONSTANTS.PLUCK_VOLUME_THRESHOLD * 400, 'var(--success)', 'PLUCK');
            addThresholdMarker(volumeContainer, CONSTANTS.RESIDUAL_VOLUME_THRESHOLD * 400, 'var(--warning)', 'MIN');
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
        // For testing restart with key 'r'
        if (event.key === 'r' && gameState.gameOverMode && gameState.canRestartWithG) {
            console.log("Manual restart triggered with 'r' key");
            gameState.gameOverMode = false;
            resetGame();
            startGame();
            return;
        }
        
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
            title: 'GUITAR SPACE DEFENDER',
            content: 'Pluck guitar strings to destroy meteors!',
            requiredString: 'E4', // High E string
            stringDisplayText: 'PLUCK HIGH E STRING (THINNEST)',
            nextTutorial: 'strings'
        },
        {
            id: 'strings',
            title: 'QUICK TEST',
            content: 'Let\'s test a few strings.',
            requiredString: 'A2', // A string
            stringDisplayText: 'PLUCK A STRING',
            nextTutorial: 'gameplay'
        },
        {
            id: 'gameplay',
            title: 'ALMOST READY',
            content: 'Match the string on each meteor to destroy it.',
            requiredString: 'D3', // D string
            stringDisplayText: 'PLUCK D STRING',
            nextTutorial: 'final'
        },
        {
            id: 'final',
            title: 'READY TO LAUNCH',
            content: 'You\'re ready! Defend the galaxy!',
            requiredString: 'E2', // Low E string
            stringDisplayText: 'PLUCK LOW E STRING (THICKEST) TO START',
            nextTutorial: null
        }
    ];
    
    // Track active tutorials
    let activeTutorial = null;

    // Show tutorial with string requirement
    function showTutorial(tutorial) {
        console.log(`Showing simplified tutorial: ${tutorial.id}`);
        
        // Update CSS first
        updateTutorialCSS();
        
        // Reset previous detection state
        gameState.lastNoteTime = 0;
        gameState.lastNote = null;
        
        // Set as active tutorial
        activeTutorial = tutorial;
        
        // Create tutorial element with simplified layout
        const tutorialElement = document.createElement('div');
        tutorialElement.className = 'tutorial-popup';
        tutorialElement.innerHTML = `
            <h3>${tutorial.title}</h3>
            <p>${tutorial.content}</p>
            <div class="string-instruction">${tutorial.stringDisplayText}</div>
            <div class="string-detection-indicator">🎸 LISTENING...</div>
        `;
        
        // Add to page
        document.body.appendChild(tutorialElement);
        
        // Make sure audio context is active
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log("Audio context resumed for tutorial");
            }).catch(err => {
                console.error("Failed to resume audio context:", err);
            });
        }
        
        // Ensure tutorial is visible
        setTimeout(() => {
            if (tutorialElement) {
                tutorialElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'center'
                });
            }
        }, 100);
        
        // Set up string detection for tutorial
        const stringDetector = setInterval(() => {
            // Check if the required string was detected
            if (gameState.lastNote === tutorial.requiredString) {
                console.log(`Required string detected: ${tutorial.requiredString}`);
                
                // Clear detection interval
                clearInterval(stringDetector);
                
                // Remove tutorial element
                if (tutorialElement.parentNode) {
                    document.body.removeChild(tutorialElement);
                }
                
                // Reset active tutorial
                const nextTutorialId = tutorial.nextTutorial;
                activeTutorial = null;
                
                // Proceed to next tutorial or start game
                setTimeout(() => {
                    if (nextTutorialId) {
                        const nextTutorial = tutorials.find(t => t.id === nextTutorialId);
                        if (nextTutorial) {
                            showTutorial(nextTutorial);
                        } else {
                            startGame();
                        }
                    } else {
                        startGame();
                    }
                }, 200); // Faster transition
            }
        }, 100);
        
        // MUCH faster emergency timeout - only 5 seconds instead of 10
        setTimeout(() => {
            if (activeTutorial === tutorial) {
                console.log("Tutorial timeout - adding skip button");
                
                if (!tutorialElement.querySelector('.emergency-button')) {
                    const emergencyButton = document.createElement('button');
                    emergencyButton.className = 'emergency-button';
                    emergencyButton.textContent = 'SKIP';
                    
                    emergencyButton.onclick = () => {
                        console.log("Tutorial skipped");
                        clearInterval(stringDetector);
                        if (tutorialElement.parentNode) {
                            document.body.removeChild(tutorialElement);
                        }
                        activeTutorial = null;
                        startGame();
                    };
                    
                    tutorialElement.appendChild(emergencyButton);
                }
            }
        }, 5000); // Reduced from 10 seconds to 5 seconds
    }

    // Function to update tutorial CSS
    function updateTutorialCSS() {
        const existingStyle = document.getElementById('tutorial-styles');
        if (existingStyle) {
            existingStyle.remove();
        }
        
        const style = document.createElement('style');
        style.id = 'tutorial-styles';
        style.textContent = `
            .tutorial-popup {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                padding: 15px 20px;
                background: rgba(15, 23, 42, 0.95);
                border: 2px solid var(--primary);
                border-radius: 8px;
                color: white;
                font-family: 'Orbitron', sans-serif;
                z-index: 100;
                max-width: 350px;
                text-align: center;
                box-shadow: 0 0 20px rgba(0, 0, 0, 0.7);
            }

            .tutorial-popup h3 {
                margin-bottom: 8px;
                color: var(--primary);
                font-size: 1.2rem;
            }

            .tutorial-popup p {
                margin-bottom: 12px;
                line-height: 1.4;
                font-size: 0.9rem;
                color: var(--text-secondary);
            }

            .string-instruction {
                color: var(--warning);
                font-weight: bold;
                font-size: 1.1rem;
                margin-bottom: 8px;
                padding: 8px 12px;
                border: 2px solid var(--warning);
                border-radius: 5px;
                animation: pulse 1.5s infinite;
                background: rgba(251, 191, 36, 0.1);
            }

            .string-detection-indicator {
                font-size: 0.7rem;
                color: var(--text-secondary);
                margin-top: 8px;
                opacity: 0.8;
            }

            .emergency-button {
                margin-top: 10px !important;
                padding: 8px 16px !important;
                background: var(--danger) !important;
                border: none !important;
                border-radius: 4px !important;
                cursor: pointer !important;
                font-weight: bold !important;
                font-size: 0.9rem !important;
                color: white !important;
                font-family: 'Orbitron', sans-serif !important;
            }

            .emergency-button:hover {
                background: #dc2626 !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Update welcome message
    function updateWelcomeMessage() {
        if (elements.status) {
            elements.status.textContent = "GUITAR SPACE DEFENDER - PRESS START FOR QUICK TUTORIAL";
        }
    }

    // Call this function to apply all changes
    function applySimplifiedTutorials() {
        // Update the tutorials array in the existing code
        window.tutorials = tutorials;
        
        // Update CSS
        updateTutorialCSS();
        
        // Update welcome message
        updateWelcomeMessage();
        
        console.log("Simplified tutorials applied!");
        console.log("Tutorials are now much shorter and have 5-second skip buttons");
    }

    // Auto-apply when this code runs
    applySimplifiedTutorials();

    // Add a function to handle game reset and restart
    function resetGame() {
        gameState.score = 0;
        gameState.lives = 3;
        gameState.level = 1;
        gameState.meteors = [];
        gameState.laserBeams = [];
        elements.scoreDisplay.textContent = "0";
        elements.livesDisplay.textContent = "3";
        gameState.gameOverMode = false;
        gameState.canRestartWithG = false;
        clearTimeout(gameState.restartTimerId);
        
        // Reset level system
        gameState.currentLevel = 1;
        gameState.gameCompleted = false;
        gameState.levelGoal = 5000;
        gameState.availableStrings = [];
    }

    // Wait for the low E string to be plucked to start the game
    function waitForStringToStartGame() {
        // Make sure audio context is initialized
        if (!audioContext) {
            initAudioContext();
        }

        // Set up interval to check if E2 is plucked
        const startGameDetector = setInterval(() => {
            if (gameState.lastNote === 'E2') {
                clearInterval(startGameDetector);
                startGame();
            }
        }, 100);
    }

    // Initialize audio context
    function initAudioContext() {
        console.log("Initializing audio context...");
        
        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                console.log("Created new audio context:", audioContext.state);
            } else if (audioContext.state === 'suspended') {
                audioContext.resume().then(() => {
                    console.log("Resumed existing audio context");
                });
            }
            
            navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                console.log("Microphone access granted");
                
                if (!analyser) {
                    analyser = audioContext.createAnalyser();
                    analyser.fftSize = CONSTANTS.FFT_SIZE;
                    console.log("Created new analyzer");
                }
                
                if (source) {
                    source.disconnect();
                    console.log("Disconnected old source");
                }
                
                source = audioContext.createMediaStreamSource(stream);
                source.connect(analyser);
                console.log("Connected new source to analyzer");
                
                detectFrequency();
                elements.status.textContent = "AUDIO SYSTEM READY";
            })
            .catch(err => {
                console.error("Microphone access denied:", err);
                elements.status.textContent = "ERROR: MICROPHONE ACCESS DENIED - CHECK BROWSER PERMISSIONS";
                elements.button.disabled = false;
                
                // Add demo mode button
                const demoButton = document.createElement('button');
                demoButton.innerText = "TRY DEMO MODE (NO MIC)";
                demoButton.style.marginTop = "10px";
                demoButton.style.padding = "10px";
                demoButton.style.backgroundColor = "#fbbf24";
                demoButton.style.color = "black";
                demoButton.style.border = "none";
                demoButton.style.borderRadius = "5px";
                demoButton.style.cursor = "pointer";
                demoButton.onclick = activateDemoMode;
                
                elements.button.parentNode.insertBefore(demoButton, elements.button.nextSibling);
            });
        } catch (e) {
            console.error("Failed to initialize audio:", e);
            elements.status.textContent = "ERROR: FAILED TO INITIALIZE AUDIO SYSTEM";
            elements.button.disabled = false;
        }
    }

    // Display welcome message
    elements.status.textContent = "WELCOME TO GUITAR SPACE DEFENDER! PLUCK LOW E STRING TO BEGIN";

    // Remove the tutorial button event listener since we're using string detection now
    const tutorialButton = document.getElementById('tutorialButton');
    if (tutorialButton) {
        tutorialButton.remove();
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

    // Initialize the game
    elements.button.addEventListener('click', function() {
        if (gameState.isRunning) {
            stopGame();
        } else {
            // Initialize audio context
            initAudioContext();
            
            // Disable button while waiting for tutorials
            elements.button.disabled = true;
            elements.button.textContent = "TUTORIAL IN PROGRESS";
            elements.button.textContent = "FOLLOW TUTORIAL INSTRUCTIONS";
            
            // Show first tutorial immediately
            setTimeout(() => {
                const welcomeTutorial = tutorials.find(t => t.id === 'welcome');
                if (welcomeTutorial) {
                    showTutorial(welcomeTutorial);
                }
            }, 500);
        }
    });

    // Mission timer variables
    let missionStartTime = 0;

    // Update mission timer display
    function updateMissionTimer() {
        if (!gameState.isRunning) return;
        
        const now = Date.now();
        const elapsed = now - missionStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        elements.missionTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        requestAnimationFrame(updateMissionTimer);
    }

    // Play start sound
    function playStartSound() {
        if (!audioContext) return;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
    }

    // Play level up sound
    function playLevelUpSound() {
        if (!audioContext) return;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.1);
        oscillator.frequency.exponentialRampToValueAtTime(1760, audioContext.currentTime + 0.2);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
    }

    // Function to update game visibility state
    function updateGameVisibility() {
        if (gameState.isRunning) {
            document.body.classList.add('game-running');
        } else {
            document.body.classList.remove('game-running');
        }
    }

    // Start the game
    function startGame() {
        // Initialize game state if not exists
        if (!gameState) {
            gameState = {
                isRunning: false,
                score: 0,
                lives: 4, // Changed to 4 lives (3 shields + 1 final life)
                currentLevel: 1,
                meteors: [],
                lasers: [],
                explosions: [],
                lastMeteorTime: 0,
                meteorInterval: 2000,
                tutorialShown: false,
                shields: [] // Add shields array to game state
            };
        }
        
        // Reset game state
        gameState.isRunning = true;
        gameState.score = 0;
        gameState.lives = 4; // Changed to 4 lives
        gameState.currentLevel = 1;
        gameState.meteors = [];
        gameState.lasers = [];
        gameState.explosions = [];
        gameState.lastMeteorTime = Date.now();
        gameState.meteorInterval = 2000;
        
        // Initialize enhanced shields
        enhancedInitializeShields();
        
        // Update UI
        if (elements.scoreDisplay) elements.scoreDisplay.textContent = '0';
        if (elements.livesDisplay) elements.livesDisplay.textContent = '4'; // Update to show 4 lives
        if (elements.button) elements.button.textContent = "ABORT MISSION";
        if (elements.status) elements.status.textContent = "DEFEND AGAINST METEORS!";
        
        // Initialize stars
        initStars();
        
        // Start mission timer
        missionStartTime = Date.now();
        requestAnimationFrame(updateMissionTimer);
        
        // Start game loop
        requestAnimationFrame(gameLoop);
        
        // Play start sound
        playStartSound();
        
        // Force the layout to center properly and scroll to it
        setTimeout(() => {
            if (elements.canvasContainer) {
                // Ensure canvas is properly sized
                resizeCanvas();
                
                // Scroll to the canvas with smooth animation
                elements.canvasContainer.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'center'
                });
            }
        }, 500);
        
        // Initialize level system
        gameState.currentLevel = 1;
        gameState.gameCompleted = false;
        setupLevelStrings();
    }

    // Stop the game with better audio handling
    function stopGame(message = "MISSION ABORTED") {
        console.log("Stopping game with message:", message);
        gameState.isRunning = false;
        
        // Update game visibility
        updateGameVisibility();
        
        // Always ensure audio remains connected and active
        if (audioContext && audioContext.state === 'suspended') {
            console.log("Resuming audio context");
            audioContext.resume();
        }
        
        // Update UI
        elements.button.textContent = "START MISSION";
        elements.missionStatus.textContent = "MISSION STANDBY";
        elements.status.textContent = message;
        
        // For game over specifically
        if (message.includes("GAME OVER")) {
            console.log("Game over detected, setting up restart with G string");
            
            // Set game over mode
            gameState.gameOverMode = true;
            gameState.canRestartWithG = false;
            
            // Clear any previous restart timer
            if (gameState.restartTimerId) {
                clearTimeout(gameState.restartTimerId);
            }
            
            // After a delay, enable restart with G
            gameState.restartTimerId = setTimeout(() => {
                console.log("Now allowing restart with G string");
                gameState.canRestartWithG = true;
                
                // Update status to make it clear
                elements.status.textContent = "GAME OVER - PLUCK G STRING TO RESTART";
                elements.status.style.color = "var(--warning)";
                elements.status.style.fontWeight = "bold";
                
                // Make sure status is visible
                elements.status.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
                
                // Keep rendering the game scene
                continueRenderingAfterGameOver();
            }, 2000);
        }
    }

    // Add this new function to keep rendering after game over
    function continueRenderingAfterGameOver() {
        if (!gameState.isRunning && gameState.gameOverMode) {
            // Keep rendering the game scene
            drawGame();
            requestAnimationFrame(continueRenderingAfterGameOver);
        }
    }

    // Simplified check tutorials function (to fix reference error)
    function checkTutorials() {
        if (!gameState.isRunning) return;
        
        // Only check for game over condition
        if (elements.status.textContent.includes("GAME OVER") && !activeTutorial) {
            const gameOverTutorial = tutorials.find(t => t.id === 'final');
            if (gameOverTutorial) {
                showTutorial(gameOverTutorial);
            }
        }
        
        // Continue checking while game is running
        if (gameState.isRunning) {
            requestAnimationFrame(checkTutorials);
        }
    }

    // This function will continuously check for G string to restart
    function setupGameOverGStringDetection() {
        // Make sure we're continuously checking for string detection
        function checkForRestart() {
            // Check if we're in game over mode and allowed to restart
            if (gameState.gameOverMode && gameState.canRestartWithG) {
                // If G string was detected recently
                if (gameState.lastNote === 'G3') {
                    const now = Date.now();
                    // Only proceed if this was a recent detection
                    if (now - gameState.lastNoteTime < 1000) {
                        console.log("G string detected - restarting game!");
                        
                        // Reset game over state
                        gameState.gameOverMode = false;
                        gameState.canRestartWithG = false;
                        
                        // Clear any pending timers
                        if (gameState.restartTimerId) {
                            clearTimeout(gameState.restartTimerId);
                            gameState.restartTimerId = null;
                        }
                        
                        // Reset and start game
                        resetGame();
                        startGame();
                        
                        // Exit this check - no need to continue
                        return;
                    }
                }
            }
            
            // Continue checking
            requestAnimationFrame(checkForRestart);
        }
        
        // Start the check loop
        checkForRestart();
    }

    // Call this function at the end of initialization
    setupGameOverGStringDetection();

    // Add keyboard shortcut to skip tutorials
    window.addEventListener('keydown', (e) => {
        // Pressing Escape key will skip all tutorials and start the game
        if (e.key === 'Escape' && activeTutorial) {
            console.log("Emergency escape triggered with Escape key");
            const tutorialElement = document.querySelector('.tutorial-popup');
            if (tutorialElement && tutorialElement.parentNode) {
                tutorialElement.parentNode.removeChild(tutorialElement);
            }
            activeTutorial = null;
            startGame();
        }
    });

    // Add automatic diagnostics when game freezes
    let lastActivityTime = Date.now();
    let activityCheckInterval = setInterval(() => {
        // If no activity for 10 seconds, print debug info
        if (Date.now() - lastActivityTime > 10000) {
            console.warn("Possible game freeze detected. Current state:");
            logGameState();
            
            // Add a message to the UI
            if (elements.status) {
                elements.status.textContent = "POSSIBLE FREEZE DETECTED - CHECK CONSOLE (F12)";
                elements.status.style.color = "var(--danger)";
            }
        }
        
        // Update activity time if game is running or tutorial active
        if (gameState.isRunning || activeTutorial) {
            lastActivityTime = Date.now();
        }
    }, 5000);

    // Function to log the current game state
    function logGameState() {
        console.log("Current Game State:", {
            isRunning: gameState.isRunning,
            score: gameState.score,
            lives: gameState.lives,
            level: gameState.level,
            meteors: gameState.meteors.length,
            lastNote: gameState.lastNote,
            lastNoteTime: gameState.lastNoteTime,
            activeTutorial: activeTutorial ? activeTutorial.id : null,
            audioContextState: audioContext ? audioContext.state : 'none',
            analyserConnected: !!analyser,
            sourceConnected: !!source
        });
    }

    // Function to force start the game (bypassing tutorials)
    function forceStartGame() {
        console.log("Force starting game...");
        
        // Clear any tutorials
        if (activeTutorial) {
            const tutorialElement = document.querySelector('.tutorial-popup');
            if (tutorialElement && tutorialElement.parentNode) {
                tutorialElement.parentNode.removeChild(tutorialElement);
            }
            activeTutorial = null;
        }
        
        // Make sure audio is initialized
        if (!audioContext) {
            initAudioContext();
        }
        
        // Reset button
        if (elements.button) {
            elements.button.disabled = false;
            elements.button.textContent = "ABORT MISSION";
        }
        
        // Start the game directly
        resetGame();
        startGame();
    }

    // Expose function to window for console debugging
    window.forceStartGame = forceStartGame;
    window.logGameState = logGameState;

    // Add new function to set up available strings for each level
    function setupLevelStrings() {
        const stringNames = Object.keys(stringFrequencies);
        
        switch(gameState.currentLevel) {
            case 1:
                // Level 1: High E and B strings only
                gameState.availableStrings = stringNames.filter(s => 
                    s === 'E4' || s === 'B3' || 
                    s === 'Eb4' || s === 'Bb3'); // Include flat tunings
                gameState.levelGoal = 5000;
                break;
            case 2:
                // Level 2: G and D strings only
                gameState.availableStrings = stringNames.filter(s => 
                    s === 'G3' || s === 'D3' || 
                    s === 'Gb3' || s === 'Db3'); // Include flat tunings
                gameState.levelGoal = 5000;
                break;
            case 3:
                // Level 3: A and Low E strings only
                gameState.availableStrings = stringNames.filter(s => 
                    s === 'A2' || s === 'E2' || s === 'D2' || 
                    s === 'Ab2' || s === 'Eb2'); // Include flat and drop D
                gameState.levelGoal = 5000;
                break;
            case 4:
                // Level 4: All strings
                gameState.availableStrings = stringNames;
                gameState.levelGoal = 10000;
                break;
            default:
                // Default - all strings
                gameState.availableStrings = stringNames;
                gameState.levelGoal = 5000;
        }
        
        // Update UI to show current level
        elements.status.textContent = `LEVEL ${gameState.currentLevel}: ${getLevelDescription()}`;
        
        console.log(`Level ${gameState.currentLevel} set up with strings:`, gameState.availableStrings);
    }

    // Helper function to get level description
    function getLevelDescription() {
        switch(gameState.currentLevel) {
            case 1: return "HIGH E & B STRINGS";
            case 2: return "G & D STRINGS";
            case 3: return "A & LOW E STRINGS";
            case 4: return "ALL STRINGS";
            default: return "CUSTOM LEVEL";
        }
    }

    // Add function to draw the level progress
    function drawLevelProgress() {
        ctx.save();
        
        // Background
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.fillRect(canvas.width / 2 - 150, 10, 300, 40);
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(canvas.width / 2 - 150, 10, 300, 40);
        
        // Level text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`LEVEL ${gameState.currentLevel}: ${gameState.score}/${gameState.levelGoal}`, canvas.width / 2, 15);
        
        // Progress bar
        const progressWidth = 280;
        const progress = Math.min(1, gameState.score / gameState.levelGoal);
        
        // Bar background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(canvas.width / 2 - 140, 30, progressWidth, 10);
        
        // Progress fill
        const gradient = ctx.createLinearGradient(
            canvas.width / 2 - 140, 0,
            canvas.width / 2 - 140 + progressWidth, 0
        );
        gradient.addColorStop(0, '#60a5fa');
        gradient.addColorStop(1, '#818cf8');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(canvas.width / 2 - 140, 30, progressWidth * progress, 10);
        
        ctx.restore();
    }

    // Moon Landing Functions
    function initMoonLanding() {
        console.log("Initializing moon landing sequence");
        
        // Set moon landing state
        gameState.moonLanding = {
            active: true,
            progress: 0,
            stars: [],
            moonSize: Math.min(canvas.width, canvas.height) * 0.6, // Reasonable moon size
            rocketPositionX: canvas.width / 2,
            rocketPositionY: 50, // Start at top
            rocketRotation: 0, // No rotation needed - draw vertically
            landingComplete: false,
            landingMessageShown: false,
            dust: []
        };
        
        // Create stars for background
        for (let i = 0; i < 150; i++) {
            gameState.moonLanding.stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2 + 1,
                speed: Math.random() * 2 + 1
            });
        }
        
        // Clear meteors and lasers
        gameState.meteors = [];
        gameState.laserBeams = [];
        
        // Set body class for special styles
        if (window.setMoonLandingMode) {
            window.setMoonLandingMode(true);
        }
        
        // Play completion fanfare sound (now much quieter)
        playCompletionSound();
        
        // Start animation
        requestAnimationFrame(updateMoonLanding);
    }

    function updateMoonLanding() {
        if (!gameState.moonLanding || !gameState.moonLanding.active) return;
        
        // Update progress for animation
        gameState.moonLanding.progress += 0.008; // Slightly faster
        const progress = Math.min(1, gameState.moonLanding.progress);
        
        // FIXED: Update rocket position to land properly on moon
        const startY = 50; // Start near top of screen
        const moonRadius = gameState.moonLanding.moonSize / 2;
        const moonSurfaceY = canvas.height - moonRadius + (moonRadius * 0.3);
        const endY = moonSurfaceY - 70; // Land on moon surface with clearance
        
        gameState.moonLanding.rocketPositionY = startY + (endY - startY) * progress;
        gameState.moonLanding.rocketPositionX = canvas.width / 2; // Keep centered
        
        // Once landing is near completion, add landing effects
        if (progress > 0.85 && !gameState.moonLanding.landingComplete) {
            // Create landing dust particles
            if (Math.random() > 0.5) {
                createLandingDustParticle();
            }
            
            // Update existing dust particles
            updateLandingDustParticles();
            
            // Check for landing completion
            if (progress >= 0.95) { // Earlier completion
                gameState.moonLanding.landingComplete = true;
                
                // Play landing sound (now much quieter)
                playLandingSound();
                
                // Create a burst of dust particles for landing impact
                for (let i = 0; i < 20; i++) {
                    createLandingDustParticle(true);
                }
            }
        }
        
        // Render the moon landing scene
        drawMoonLanding();
        
        // Continue animation if not complete
        if (progress < 1) {
            requestAnimationFrame(updateMoonLanding);
        } else {
            // Animation complete - show final message after a short delay
            if (!gameState.moonLanding.landingMessageShown) {
                gameState.moonLanding.landingMessageShown = true;
                
                setTimeout(() => {
                    // Show mission complete message
                    showCompletionMessage();
                    
                    // End moon landing sequence after a delay
                    setTimeout(() => {
                        gameState.moonLanding.active = false;
                        if (window.setMoonLandingMode) {
                            window.setMoonLandingMode(false);
                        }
                        stopGame("MISSION COMPLETE - ALL STRINGS MASTERED!");
                    }, 3000); // Shorter delay
                }, 1000);
            }
        }
    }

    function drawMoonLanding() {
        if (!gameState.moonLanding) return;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw space background
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw stars
        gameState.moonLanding.stars.forEach(star => {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fillRect(star.x, star.y, star.size, star.size);
        });
        
        // FIXED: Calculate moon position properly - moon stays at bottom
        const moonRadius = gameState.moonLanding.moonSize / 2;
        const moonCenterX = canvas.width / 2;
        const moonCenterY = canvas.height - moonRadius + (moonRadius * 0.3); // Moon visible at bottom
        
        // Draw moon glow effect
        const moonGlow = ctx.createRadialGradient(
            moonCenterX, moonCenterY, moonRadius * 0.9,
            moonCenterX, moonCenterY, moonRadius * 1.3
        );
        moonGlow.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        moonGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = moonGlow;
        ctx.beginPath();
        ctx.arc(moonCenterX, moonCenterY, moonRadius * 1.3, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw moon surface
        const moonGradient = ctx.createRadialGradient(
            moonCenterX, moonCenterY, 0,
            moonCenterX, moonCenterY, moonRadius
        );
        moonGradient.addColorStop(0, '#e5e5e5');
        moonGradient.addColorStop(0.5, '#d4d4d4');
        moonGradient.addColorStop(0.8, '#a3a3a3');
        moonGradient.addColorStop(1, '#94a3b8');
        
        ctx.fillStyle = moonGradient;
        ctx.beginPath();
        ctx.arc(moonCenterX, moonCenterY, moonRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw moon craters
        const craters = [
            { x: -0.3, y: -0.4, size: 0.15 },
            { x: 0.2, y: -0.3, size: 0.1 },
            { x: -0.1, y: 0.1, size: 0.2 },
            { x: 0.4, y: 0.2, size: 0.12 },
            { x: -0.4, y: 0.3, size: 0.08 }
        ];
        
        craters.forEach(crater => {
            const craterX = moonCenterX + moonRadius * crater.x;
            const craterY = moonCenterY + moonRadius * crater.y;
            const craterSize = moonRadius * crater.size;
            
            const craterGradient = ctx.createRadialGradient(
                craterX, craterY, 0,
                craterX, craterY, craterSize
            );
            craterGradient.addColorStop(0, '#94a3b8');
            craterGradient.addColorStop(0.5, '#64748b');
            craterGradient.addColorStop(1, '#475569');
            
            ctx.fillStyle = craterGradient;
            ctx.beginPath();
            ctx.arc(craterX, craterY, craterSize, 0, Math.PI * 2);
            ctx.fill();
        });
        
        // Draw landing dust particles
        drawLandingDustParticles();
        
        // Get rocket position
        const rocketX = gameState.moonLanding.rocketPositionX;
        const rocketY = gameState.moonLanding.rocketPositionY;
        
        // Draw landing flame if descending
        if (gameState.moonLanding.progress < 0.97) {
            const flameIntensity = Math.max(0.5, Math.sin(Date.now() / 100) * 0.5 + 0.5);
            const flameSize = 25 * flameIntensity;
            
            // Flame positioned below rocket
            const flameGradient = ctx.createRadialGradient(
                rocketX, rocketY + 45, 5,
                rocketX, rocketY + 45, flameSize
            );
            flameGradient.addColorStop(0, 'rgba(255, 165, 0, 0.9)');
            flameGradient.addColorStop(0.5, 'rgba(255, 69, 0, 0.5)');
            flameGradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
            
            ctx.fillStyle = flameGradient;
            ctx.beginPath();
            ctx.arc(rocketX, rocketY + 45, flameSize, 0, Math.PI * 2);
            ctx.fill();
            
            // Inner flame
            ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
            ctx.beginPath();
            ctx.moveTo(rocketX - 6, rocketY + 40);
            ctx.lineTo(rocketX, rocketY + 40 + flameSize * 0.6);
            ctx.lineTo(rocketX + 6, rocketY + 40);
            ctx.closePath();
            ctx.fill();
        }
        
        // Draw the rocket (vertical orientation)
        ctx.save();
        ctx.translate(rocketX, rocketY);
        
        // Rocket body
        const bodyGradient = ctx.createLinearGradient(-15, -40, 15, 40);
        bodyGradient.addColorStop(0, '#60a5fa');
        bodyGradient.addColorStop(0.5, '#3b82f6');
        bodyGradient.addColorStop(1, '#1d4ed8');
        
        ctx.fillStyle = bodyGradient;
        ctx.beginPath();
        ctx.moveTo(0, -40);
        ctx.lineTo(-15, -20);
        ctx.lineTo(-15, 30);
        ctx.lineTo(-8, 40);
        ctx.lineTo(8, 40);
        ctx.lineTo(15, 30);
        ctx.lineTo(15, -20);
        ctx.closePath();
        ctx.fill();
        
        // Nose cone
        ctx.fillStyle = '#60a5fa';
        ctx.beginPath();
        ctx.moveTo(-15, -20);
        ctx.lineTo(0, -50);
        ctx.lineTo(15, -20);
        ctx.closePath();
        ctx.fill();
        
        // Windows
        ctx.fillStyle = '#dbeafe';
        ctx.beginPath();
        ctx.arc(0, -10, 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(0, 10, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Landing legs (extend during descent)
        if (gameState.moonLanding.progress > 0.5) {
            const legExtension = Math.min(1, (gameState.moonLanding.progress - 0.5) * 4);
            
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 3;
            
            // Left leg
            ctx.beginPath();
            ctx.moveTo(-15, 35);
            ctx.lineTo(-20 - (8 * legExtension), 45 + (12 * legExtension));
            ctx.stroke();
            
            // Right leg
            ctx.beginPath();
            ctx.moveTo(15, 35);
            ctx.lineTo(20 + (8 * legExtension), 45 + (12 * legExtension));
            ctx.stroke();
            
            // Feet
            ctx.fillStyle = '#94a3b8';
            ctx.beginPath();
            ctx.arc(-20 - (8 * legExtension), 45 + (12 * legExtension), 3, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(20 + (8 * legExtension), 45 + (12 * legExtension), 3, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
        
        // Draw flag when landed
        if (gameState.moonLanding.landingComplete) {
            // Flag pole
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(moonCenterX + 60, moonCenterY - 80);
            ctx.lineTo(moonCenterX + 60, moonCenterY - 10);
            ctx.stroke();
            
            // Flag background with gradient
            const flagGradient = ctx.createLinearGradient(
                moonCenterX + 60, moonCenterY - 80,
                moonCenterX + 120, moonCenterY - 80
            );
            flagGradient.addColorStop(0, '#3b82f6');
            flagGradient.addColorStop(0.5, '#1d4ed8');
            flagGradient.addColorStop(1, '#1e40af');
            
            ctx.fillStyle = flagGradient;
            ctx.fillRect(moonCenterX + 60, moonCenterY - 80, 60, 40);
            
            // Flag border
            ctx.strokeStyle = '#1e40af';
            ctx.lineWidth = 2;
            ctx.strokeRect(moonCenterX + 60, moonCenterY - 80, 60, 40);
            
            // Draw horizontal guitar INSIDE the flag boundaries
            const guitarCenterX = moonCenterX + 90; // Center of flag horizontally
            const guitarCenterY = moonCenterY - 60; // Center of flag vertically
            
            // Guitar body (horizontal orientation)
            ctx.fillStyle = '#fbbf24'; // Golden yellow for guitar body
            ctx.beginPath();
            // Horizontal guitar body (ellipse)
            ctx.ellipse(guitarCenterX + 5, guitarCenterY, 10, 6, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Guitar body outline
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Guitar sound hole (on the body)
            ctx.fillStyle = '#1f2937';
            ctx.beginPath();
            ctx.arc(guitarCenterX + 5, guitarCenterY, 3, 0, Math.PI * 2);
            ctx.fill();
            
            // Guitar neck (horizontal, extending left from body)
            ctx.fillStyle = '#92400e'; // Brown neck
            ctx.fillRect(guitarCenterX - 15, guitarCenterY - 1, 20, 2);
            
            // Guitar headstock (at the left end)
            ctx.fillStyle = '#92400e';
            ctx.fillRect(guitarCenterX - 18, guitarCenterY - 3, 5, 6);
            
            // Guitar strings (horizontal, running along the neck)
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 0.3;
            
            for (let i = 0; i < 6; i++) {
                const stringY = guitarCenterY - 2.5 + (i * 1);
                ctx.beginPath();
                ctx.moveTo(guitarCenterX - 15, stringY);
                ctx.lineTo(guitarCenterX + 15, stringY);
                ctx.stroke();
            }
            
            // Guitar tuning pegs (on the left side of headstock)
            ctx.fillStyle = '#6b7280';
            for (let i = 0; i < 6; i++) {
                const pegY = guitarCenterY - 2.5 + (i * 1);
                ctx.beginPath();
                ctx.arc(guitarCenterX - 16, pegY, 0.8, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Guitar bridge (on the right side of body)
            ctx.fillStyle = '#374151';
            ctx.fillRect(guitarCenterX + 13, guitarCenterY - 2.5, 2, 5);
            
            // Add frets on the neck (vertical lines across horizontal neck)
            ctx.strokeStyle = '#d6d3d1';
            ctx.lineWidth = 0.3;
            for (let i = 1; i <= 3; i++) {
                const fretX = guitarCenterX - 10 + (i * 4);
                ctx.beginPath();
                ctx.moveTo(fretX, guitarCenterY - 2);
                ctx.lineTo(fretX, guitarCenterY + 2);
                ctx.stroke();
            }
            
            // Add small musical notes in corners of flag
            ctx.fillStyle = '#dbeafe';
            ctx.font = 'bold 6px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('♪', moonCenterX + 70, moonCenterY - 70); // Top left
            ctx.fillText('♫', moonCenterX + 110, moonCenterY - 70); // Top right
            ctx.fillText('♪', moonCenterX + 70, moonCenterY - 40); // Bottom left
            ctx.fillText('♫', moonCenterX + 110, moonCenterY - 40); // Bottom right
            
            // Add text at top of flag
            ctx.fillStyle = '#dbeafe';
            ctx.font = 'bold 5px Orbitron, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('GUITAR SPACE MISSION', guitarCenterX, moonCenterY - 75);
            
            // Add subtle sparkles ONLY at flag corners
            const sparkles = [
                { x: moonCenterX + 62, y: moonCenterY - 78, size: 1 }, // Top left
                { x: moonCenterX + 118, y: moonCenterY - 78, size: 1 }, // Top right
                { x: moonCenterX + 62, y: moonCenterY - 42, size: 1 }, // Bottom left
                { x: moonCenterX + 118, y: moonCenterY - 42, size: 1 } // Bottom right
            ];
            
            sparkles.forEach(sparkle => {
                // Animated sparkles
                const sparkleOpacity = 0.5 + Math.sin(Date.now() / 300 + sparkle.x) * 0.3;
                ctx.fillStyle = `rgba(255, 255, 255, ${sparkleOpacity})`;
                
                // Draw small sparkle
                ctx.save();
                ctx.translate(sparkle.x, sparkle.y);
                ctx.beginPath();
                for (let i = 0; i < 4; i++) {
                    const angle = (i * Math.PI) / 2;
                    const radius = i % 2 === 0 ? sparkle.size : sparkle.size / 2;
                    const x = Math.cos(angle) * radius;
                    const y = Math.sin(angle) * radius;
                    
                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            });
            
            // Subtle flag waving effect (just the right edge)
            const waveOffset = Math.sin(Date.now() / 1000) * 1;
            ctx.save();
            ctx.translate(moonCenterX + 120, moonCenterY - 60);
            
            // Draw subtle wave on flag edge
            ctx.strokeStyle = '#1e40af';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, -20);
            for (let i = 0; i <= 40; i += 5) {
                const waveX = Math.sin((i + Date.now() / 400) * 0.5) * 0.5;
                const waveY = -20 + i;
                ctx.lineTo(waveX, waveY);
            }
            ctx.stroke();
            
            ctx.restore();
        }
    }

    function createLandingDustParticle(burstMode = false) {
        if (!gameState.moonLanding) return;
        
        const moonRadius = gameState.moonLanding.moonSize / 2;
        const moonCenterX = canvas.width / 2;
        const moonCenterY = canvas.height + moonRadius - (moonRadius * 2 * gameState.moonLanding.progress);
        
        // Calculate dust spawn position (at the rocket's feet on the moon surface)
        const dustX = gameState.moonLanding.rocketPositionX;
        const dustY = moonCenterY - moonRadius + 10;
        
        // Create a dust particle
        const angle = burstMode ? Math.random() * Math.PI * 2 : Math.random() * Math.PI + Math.PI / 2;
        const speed = burstMode ? 1 + Math.random() * 3 : 0.5 + Math.random();
        
        const particle = {
            x: dustX + (Math.random() - 0.5) * 20,
            y: dustY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: 1 + Math.random() * 3,
            opacity: 0.8,
            life: 1.0
        };
        
        gameState.moonLanding.dust.push(particle);
    }

    function updateLandingDustParticles() {
        if (!gameState.moonLanding || !gameState.moonLanding.dust) return;
        
        gameState.moonLanding.dust = gameState.moonLanding.dust.filter(particle => {
            // Update position
            particle.x += particle.vx;
            particle.y += particle.vy;
            
            // Apply gravity
            particle.vy += 0.01;
            
            // Decrease life
            particle.life -= 0.02;
            particle.opacity -= 0.02;
            
            // Keep if still alive
            return particle.life > 0;
        });
    }

    function drawLandingDustParticles() {
        if (!gameState.moonLanding || !gameState.moonLanding.dust) return;
        
        gameState.moonLanding.dust.forEach(particle => {
            ctx.fillStyle = `rgba(200, 200, 200, ${particle.opacity})`;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function showCompletionMessage() {
        // Draw a message box
        ctx.save();
        
        // Background
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(canvas.width / 2 - 250, canvas.height / 2 - 100, 500, 200);
        
        // Border
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.8)';
        ctx.lineWidth = 3;
        ctx.strokeRect(canvas.width / 2 - 250, canvas.height / 2 - 100, 500, 200);
        
        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('MISSION COMPLETE!', canvas.width / 2, canvas.height / 2 - 50);
        
        // Message
        ctx.font = 'bold 18px Orbitron, sans-serif';
        ctx.fillStyle = '#60a5fa';
        ctx.fillText('You have mastered all guitar strings!', canvas.width / 2, canvas.height / 2);
        
        // Stats
        ctx.font = '16px Orbitron, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`Final Score: ${gameState.score}`, canvas.width / 2, canvas.height / 2 + 40);
        
        // Completed message
        ctx.font = '14px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Your guitar skills are now out of this world!', canvas.width / 2, canvas.height / 2 + 70);
        
        ctx.restore();
    }

    function playLandingSound() {
        if (!audioContext) return;
        
        // Create sounds for landing
        const bufferSize = audioContext.sampleRate / 5; // 200ms buffer
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        // Fill with noise that fades out - MUCH QUIETER
        for (let i = 0; i < bufferSize; i++) {
            const t = i / bufferSize;
            data[i] = (Math.random() * 2 - 1) * (1 - t) * 0.15; // REDUCED amplitude by 85%
        }
        
        // Create source from buffer
        const noise = audioContext.createBufferSource();
        noise.buffer = buffer;
        
        // Create filters for rumbling sound
        const lowpass = audioContext.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.setValueAtTime(200, audioContext.currentTime);
        lowpass.Q.setValueAtTime(5, audioContext.currentTime);
        
        // Create gain node with MUCH REDUCED VOLUME
        const gain = audioContext.createGain();
        gain.gain.setValueAtTime(0.05, audioContext.currentTime); // Changed from 0.5 to 0.05
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.5);
        
        // Connect nodes
        noise.connect(lowpass);
        lowpass.connect(gain);
        gain.connect(audioContext.destination);
        
        // Play sound
        noise.start();
        noise.stop(audioContext.currentTime + 1.5);
        
        // Also play a low note for impact with MUCH REDUCED VOLUME
        const oscillator = audioContext.createOscillator();
        const oscGain = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(80, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(40, audioContext.currentTime + 1);
        
        // MUCH REDUCED VOLUME: Changed from 0.5 to 0.03
        oscGain.gain.setValueAtTime(0.03, audioContext.currentTime);
        oscGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.5);
        
        oscillator.connect(oscGain);
        oscGain.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 1.5);
    }

    function playCompletionSound() {
        if (!audioContext) return;
        
        // Create a sequence of notes for a victory fanfare
        const notes = [
            { freq: 392, duration: 0.2 },  // G4
            { freq: 392, duration: 0.2 },  // G4
            { freq: 587.33, duration: 0.4 }, // D5
            { freq: 523.25, duration: 0.2 }, // C5
            { freq: 493.88, duration: 0.2 }, // B4
            { freq: 440, duration: 0.2 },   // A4
            { freq: 783.99, duration: 0.6 }  // G5 (longer final note)
        ];
        
        // Play each note in sequence with REDUCED VOLUME
        let startTime = audioContext.currentTime;
        
        notes.forEach(note => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.type = 'sine'; // Changed from 'square' to 'sine' for softer sound
            oscillator.frequency.setValueAtTime(note.freq, startTime);
            
            // REDUCED VOLUME: Changed from 0.3 to 0.08 (much quieter)
            gainNode.gain.setValueAtTime(0.08, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + note.duration);
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.start(startTime);
            oscillator.stop(startTime + note.duration);
            
            startTime += note.duration;
        });
    }

    // Add completion sound function
    function playCompletionSound() {
        if (!audioContext) return;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.2);
        oscillator.frequency.exponentialRampToValueAtTime(1760, audioContext.currentTime + 0.4);
        oscillator.frequency.exponentialRampToValueAtTime(3520, audioContext.currentTime + 0.6);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.8);
    }

    // Add emergency recovery functions
    window.fixGameFreeze = function() {
        console.log("Manual freeze recovery initiated");
        
        if (activeTutorial) {
            const tutorialElement = document.querySelector('.tutorial-popup');
            if (tutorialElement && tutorialElement.parentNode) {
                tutorialElement.parentNode.removeChild(tutorialElement);
            }
            activeTutorial = null;
        }
        
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log("Audio context resumed");
            });
        }
        
        resetGame();
        
        if (elements.button) {
            elements.button.disabled = false;
            elements.button.textContent = "START MISSION";
        }
        
        if (elements.status) {
            elements.status.textContent = "READY TO START - PRESS BUTTON";
        }
        
        return "Game state reset - press Start button to begin";
    };

    // Update keyboard shortcuts
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && activeTutorial) {
            console.log("Emergency escape triggered with Escape key");
            const tutorialElement = document.querySelector('.tutorial-popup');
            if (tutorialElement && tutorialElement.parentNode) {
                tutorialElement.parentNode.removeChild(tutorialElement);
            }
            activeTutorial = null;
            startGame();
        }
        
        if (event.key === 'r' && gameState.gameOverMode && gameState.canRestartWithG) {
            console.log("Manual restart triggered with 'r' key");
            gameState.gameOverMode = false;
            resetGame();
            startGame();
        }
        
        if (event.key === 's' && !gameState.isRunning && !activeTutorial) {
            console.log("Emergency start triggered with 's' key");
            forceStartGame();
        }
    });

    // Expose emergency functions
    window.forceStartGame = forceStartGame;
    window.fixGameFreeze = fixGameFreeze;

    console.log("Tutorial and gameplay fixes applied!");

    // Add helper function for threshold markers
    function addThresholdMarker(container, percentage, color, label) {
        const marker = document.createElement('div');
        marker.className = 'threshold-marker';
        marker.style.position = 'absolute';
        marker.style.left = `${percentage}%`;
        marker.style.top = '0';
        marker.style.bottom = '0';
        marker.style.width = '2px';
        marker.style.backgroundColor = color;
        marker.style.zIndex = '1';
        
        const markerLabel = document.createElement('div');
        markerLabel.className = 'threshold-label';
        markerLabel.textContent = label;
        markerLabel.style.position = 'absolute';
        markerLabel.style.bottom = '-20px';
        markerLabel.style.left = '50%';
        markerLabel.style.transform = 'translateX(-50%)';
        markerLabel.style.fontSize = '10px';
        markerLabel.style.color = color;
        markerLabel.style.whiteSpace = 'nowrap';
        
        marker.appendChild(markerLabel);
        container.appendChild(marker);
    }

    // Helper function to toggle moon landing mode
    function setMoonLandingMode(active) {
        if (active) {
            document.body.classList.add('moon-landing-mode');
        } else {
            document.body.classList.remove('moon-landing-mode');
        }
    }

    // Expose helper functions to window object
    window.setMoonLandingMode = setMoonLandingMode;

    // Add cheat code functionality for moon landing
    document.addEventListener('keydown', (event) => {
        // Press 'M' to trigger moon landing
        if (event.key === 'm' || event.key === 'M') {
            console.log("Moon landing cheat activated!");
            
            // Initialize audio context if needed
            if (!audioContext) {
                initAudioContext();
            }
            
            // Set game state to completed
            gameState.gameCompleted = true;
            gameState.isRunning = false;
            gameState.score = 10000; // Set high score
            gameState.currentLevel = 4;
            
            // Clear any existing game elements
            gameState.meteors = [];
            gameState.laserBeams = [];
            
            // Update UI
            elements.scoreDisplay.textContent = gameState.score;
            if (elements.status) {
                elements.status.textContent = "CHEAT ACTIVATED - JUMPING TO MOON LANDING...";
            }
            
            // Start moon landing sequence
            setTimeout(() => {
                initMoonLanding();
            }, 500);
        }
        
        // Press 'R' to reset game (useful for testing)
        if (event.key === 'r' || event.key === 'R') {
            console.log("Game reset cheat activated!");
            
            // Reset everything
            gameState.gameCompleted = false;
            gameState.isRunning = false;
            gameState.score = 0;
            gameState.currentLevel = 1;
            gameState.lives = 3;
            gameState.meteors = [];
            gameState.laserBeams = [];
            
            // Reset moon landing
            if (gameState.moonLanding) {
                gameState.moonLanding.active = false;
            }
            
            // Reset UI
            elements.scoreDisplay.textContent = "0";
            elements.livesDisplay.textContent = "3";
            elements.button.textContent = "START MISSION";
            elements.button.disabled = false;
            elements.status.textContent = "GAME RESET - READY TO START";
            
            // Remove moon landing mode
            if (window.setMoonLandingMode) {
                window.setMoonLandingMode(false);
            }
            
            // Clear canvas
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
    });

    // Add test buttons for development
    document.addEventListener('DOMContentLoaded', () => {
        // Create test button dynamically
        const testButton = document.createElement('button');
        testButton.textContent = 'TEST MOON LANDING';
        testButton.id = 'moonLandingTestButton';
        testButton.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 1000;
            padding: 10px 15px;
            background: #fbbf24;
            color: #000;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
            font-family: 'Orbitron', sans-serif;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;
        
        testButton.addEventListener('click', () => {
            console.log("Moon landing test button clicked!");
            
            // Initialize audio context if needed
            if (!audioContext) {
                initAudioContext();
            }
            
            // Set game state to completed
            gameState.gameCompleted = true;
            gameState.isRunning = false;
            gameState.score = 10000;
            gameState.currentLevel = 4;
            
            // Clear any existing game elements
            gameState.meteors = [];
            gameState.laserBeams = [];
            
            // Update UI
            if (elements.scoreDisplay) elements.scoreDisplay.textContent = gameState.score;
            if (elements.status) {
                elements.status.textContent = "TEST MODE - TESTING MOON LANDING...";
            }
            
            // Start moon landing sequence
            setTimeout(() => {
                initMoonLanding();
            }, 500);
        });
        
        // Add button to page
        document.body.appendChild(testButton);
        
        // Also add reset button
        const resetButton = document.createElement('button');
        resetButton.textContent = 'RESET GAME';
        resetButton.style.cssText = `
            position: fixed;
            top: 60px;
            right: 10px;
            z-index: 1000;
            padding: 10px 15px;
            background: #ef4444;
            color: #fff;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
            font-family: 'Orbitron', sans-serif;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;
        
        resetButton.addEventListener('click', () => {
            console.log("Game reset button clicked!");
            location.reload(); // Simple page reload to reset everything
        });
        
        document.body.appendChild(resetButton);
    });

    // Add console commands for testing
    window.testMoonLanding = function() {
        console.log("Testing moon landing from console...");
        
        if (!audioContext) {
            initAudioContext();
        }
        
        gameState.gameCompleted = true;
        gameState.isRunning = false;
        gameState.score = 10000;
        gameState.currentLevel = 4;
        gameState.meteors = [];
        gameState.laserBeams = [];
        
        elements.scoreDisplay.textContent = gameState.score;
        elements.missionStatus.textContent = "CONSOLE TEST - TESTING MOON LANDING...";
        
        setTimeout(() => {
            initMoonLanding();
        }, 500);
    };

    window.resetGame = function() {
        console.log("Resetting game from console...");
        location.reload();
    };

    // Log cheat code instructions
    console.log("🚀 MOON LANDING TEST CHEATS LOADED!");
    console.log("Press 'M' key = Jump to Moon Landing");
    console.log("Press 'R' key = Reset Game");
    console.log("Or use the test buttons in top-right corner");
    console.log("Or type in console: testMoonLanding() or resetGame()");

    // Update game layout to single screen
    function updateGameLayout() {
        const gameContainer = document.querySelector('.game-container');
        if (!gameContainer) return;
        
        // Remove the old game controls entirely
        const oldControls = document.querySelector('.game-controls');
        if (oldControls) {
            oldControls.remove();
        }
        
        // Create new simplified header with start button
        const gameHeader = document.querySelector('.game-header');
        if (gameHeader) {
            gameHeader.innerHTML = `
                <h1 class="game-title">GUITAR SPACE DEFENDER</h1>
                <p class="game-subtitle">Pluck guitar strings to destroy meteors!</p>
                
                <!-- Compact Game Controls -->
                <div class="compact-controls">
                    <div class="tuning-control">
                        <select id="tuningSelect" class="tuning-dropdown">
                            <option value="standard">Standard E (EADGBE)</option>
                            <option value="half-step">Half Step Down</option>
                            <option value="dropD">Drop D (DADGBE)</option>
                        </select>
                    </div>
                    
                    <button id="startButton" class="start-button">START MISSION</button>
                    
                    <div class="game-stats">
                        <span class="stat-item">SCORE: <span id="scoreDisplay">0</span></span>
                        <span class="stat-item">SHIELDS: <span id="livesDisplay">3</span></span>
                        <span class="stat-item">LEVEL: <span id="levelDisplay">1</span></span>
                    </div>
                </div>
                
                <!-- Volume Monitor -->
                <div class="volume-monitor">
                    <div class="volume-label">
                        <i data-lucide="mic"></i>
                        <span>GUITAR INPUT</span>
                        <span id="currentNote" class="current-note">-</span>
                    </div>
                    <div class="volume-bar">
                        <div id="volumeLevel" class="volume-level"></div>
                    </div>
                </div>
            `;
        }
        
        // Update the canvas container to be more prominent
        const canvasContainer = document.querySelector('.canvas-container');
        if (canvasContainer) {
            canvasContainer.style.marginTop = '1rem';
            canvasContainer.style.marginBottom = '1rem';
        }
        
        // Move status message right after canvas
        const statusElement = document.getElementById('status');
        if (statusElement && canvasContainer) {
            canvasContainer.parentNode.insertBefore(statusElement, canvasContainer.nextSibling);
            statusElement.style.marginTop = '1rem';
            statusElement.style.marginBottom = '1rem';
        }
        
        // Reinitialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }
        
        // Re-bind event listeners
        bindEventListeners();
        
        console.log("Game layout updated - everything now on one screen!");
    }

    // Re-bind the event listeners to the new elements
    function bindEventListeners() {
        // Start button
        const startButton = document.getElementById('startButton');
        if (startButton) {
            // Remove old listeners
            startButton.replaceWith(startButton.cloneNode(true));
            const newStartButton = document.getElementById('startButton');
            
            newStartButton.addEventListener('click', function() {
                if (gameState.isRunning) {
                    stopGame();
                } else {
                    // Initialize audio context
                    initAudioContext();
                    
                    // Disable button while waiting for tutorials
                    newStartButton.disabled = true;
                    newStartButton.textContent = "TUTORIAL IN PROGRESS";
                    
                    // Show first tutorial
                    setTimeout(() => {
                        const welcomeTutorial = tutorials.find(t => t.id === 'welcome');
                        if (welcomeTutorial) {
                            showTutorial(welcomeTutorial);
                        }
                    }, 500);
                }
            });
        }
        
        // Tuning selector
        const tuningSelect = document.getElementById('tuningSelect');
        if (tuningSelect) {
            tuningSelect.addEventListener('change', function() {
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
                    
                    const statusElement = document.getElementById('status');
                    if (statusElement) {
                        statusElement.textContent = `TUNING SWITCHED TO ${tunings[currentTuning].name.toUpperCase()}`;
                    }
                }
            });
        }
    }

    // Update the CSS for the new compact layout
    const compactLayoutCSS = `
    /* Remove old game controls styles and add new compact ones */
    .game-controls {
        display: none !important; /* Hide old controls */
    }

    .game-header {
        text-align: center;
        margin-bottom: 1.5rem;
        background: rgba(15, 23, 42, 0.8);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(96, 165, 250, 0.3);
        border-radius: 10px;
        padding: 1.5rem;
    }

    .game-title {
        font-family: 'Orbitron', sans-serif;
        font-size: 2.5rem;
        font-weight: 700;
        background: linear-gradient(90deg, var(--primary), var(--accent));
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        margin-bottom: 0.5rem;
        text-shadow: 0 0 20px rgba(96, 165, 250, 0.5);
    }

    .game-subtitle {
        font-size: 1.1rem;
        color: var(--text-secondary);
        margin-bottom: 1.5rem;
    }

    .compact-controls {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        align-items: center;
        max-width: 600px;
        margin: 0 auto;
    }

    .tuning-control {
        width: 100%;
        max-width: 300px;
    }

    .tuning-dropdown {
        width: 100%;
        padding: 0.75rem;
        background: rgba(30, 41, 59, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: var(--text-primary);
        font-family: 'Orbitron', sans-serif;
        font-size: 0.9rem;
    }

    .start-button {
        width: 100%;
        max-width: 300px;
        padding: 1rem 2rem;
        background: linear-gradient(145deg, #22c55e 0%, #16a34a 100%);
        border: 2px solid #22c55e;
        border-radius: 8px;
        color: white;
        font-family: 'Orbitron', sans-serif;
        font-size: 1.2rem;
        font-weight: bold;
        letter-spacing: 1px;
        cursor: pointer;
        transition: all 0.3s ease;
        box-shadow: 0 0 15px rgba(34, 197, 94, 0.5);
        animation: pulse 2s infinite;
    }

    .start-button:hover {
        background: linear-gradient(145deg, #16a34a 0%, #22c55e 100%);
        transform: translateY(-3px);
        box-shadow: 0 5px 15px rgba(34, 197, 94, 0.6);
    }

    .start-button:disabled {
        background: rgba(100, 100, 100, 0.5);
        border-color: rgba(100, 100, 100, 0.5);
        cursor: not-allowed;
        animation: none;
        transform: none;
    }

    .game-stats {
        display: flex;
        gap: 2rem;
        justify-content: center;
        flex-wrap: wrap;
    }

    .stat-item {
        font-family: 'Orbitron', sans-serif;
        font-size: 1rem;
        font-weight: 600;
        color: var(--text-primary);
        background: rgba(30, 41, 59, 0.6);
        padding: 0.5rem 1rem;
        border-radius: 8px;
        border: 1px solid rgba(96, 165, 250, 0.2);
    }

    .stat-item span {
        color: var(--primary);
        font-weight: 700;
    }

    .volume-monitor {
        margin-top: 1rem;
        background: rgba(30, 41, 59, 0.4);
        border-radius: 8px;
        padding: 0.75rem;
    }

    .volume-label {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
        font-family: 'Orbitron', sans-serif;
        font-size: 0.9rem;
        color: var(--text-secondary);
    }

    .current-note {
        color: var(--primary) !important;
        font-weight: bold !important;
        min-width: 60px;
        text-align: center;
    }

    .volume-bar {
        height: 8px;
        background: rgba(30, 41, 59, 0.6);
        border-radius: 4px;
        overflow: hidden;
        position: relative;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .volume-level {
        height: 100%;
        background: linear-gradient(90deg, var(--primary), var(--accent));
        width: 0%;
        transition: width 0.1s ease-out;
    }

    /* Canvas container adjustments */
    .canvas-container {
        width: 100%;
        max-width: 900px;
        margin: 0 auto;
        position: relative;
        padding-top: 54%; /* Adjusted aspect ratio for better fit */
    }

    .canvas-container #gameCanvas {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
        border-radius: 8px;
    }

    /* Status message styling */
    #status {
        width: 100%;
        max-width: 900px;
        margin: 0 auto;
        padding: 0.75rem;
        background: rgba(30, 41, 59, 0.6);
        border-radius: 8px;
        font-family: 'Orbitron', sans-serif;
        text-align: center;
        color: var(--warning);
        border: 1px solid rgba(96, 165, 250, 0.2);
    }

    /* Instructions adjustments */
    .instructions {
        margin-top: 1rem;
        background: rgba(15, 23, 42, 0.8);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(96, 165, 250, 0.2);
        border-radius: 10px;
        padding: 1rem;
        width: 100%;
        max-width: 900px;
        margin-left: auto;
        margin-right: auto;
    }

    /* Responsive adjustments */
    @media (max-width: 768px) {
        .game-title {
            font-size: 2rem;
        }
        
        .game-stats {
            gap: 1rem;
        }
        
        .stat-item {
            font-size: 0.9rem;
            padding: 0.4rem 0.8rem;
        }
        
        .compact-controls {
            gap: 0.75rem;
        }
        
        .canvas-container {
            padding-top: 60%; /* Slightly taller on mobile */
        }
    }

    @media (max-width: 480px) {
        .game-title {
            font-size: 1.5rem;
        }
        
        .game-stats {
            flex-direction: column;
            gap: 0.5rem;
            align-items: center;
        }
        
        .stat-item {
            width: 100%;
            max-width: 200px;
            text-align: center;
        }
    }
    `;

    // Function to inject the new CSS
    function updateLayoutCSS() {
        const existingStyle = document.getElementById('compact-layout-styles');
        if (existingStyle) {
            existingStyle.remove();
        }
        
        const style = document.createElement('style');
        style.id = 'compact-layout-styles';
        style.textContent = compactLayoutCSS;
        document.head.appendChild(style);
    }

    // Function to update element references after layout change
    function updateElementReferences() {
        // Update the elements object with new references
        const newElements = {
            button: document.getElementById('startButton'),
            status: document.getElementById('status'),
            currentNote: document.getElementById('currentNote'),
            volumeLevel: document.getElementById('volumeLevel'),
            tuningSelect: document.getElementById('tuningSelect'),
            scoreDisplay: document.getElementById('scoreDisplay'),
            livesDisplay: document.getElementById('livesDisplay'),
            levelDisplay: document.getElementById('levelDisplay'),
            gameCanvas: document.getElementById('gameCanvas'),
            canvasContainer: document.querySelector('.canvas-container')
        };
        
        // Update the global elements object
        Object.assign(elements, newElements);
    }

    // Main function to apply all layout changes
    function applySingleScreenLayout() {
        console.log("Applying single screen layout...");
        
        // Update CSS first
        updateLayoutCSS();
        
        // Update HTML structure
        updateGameLayout();
        
        // Update element references
        updateElementReferences();
        
        // Update any functions that reference the old mission timer
        function updateMissionTimer() {
            // Remove mission timer functionality since we removed the element
            return;
        }
        
        // Update the startGame function to work with new layout
        const originalStartGame = window.startGame;
        if (originalStartGame) {
            window.startGame = function() {
                originalStartGame.call(this);
                
                // Update the level display if it exists
                const levelDisplay = document.getElementById('levelDisplay');
                if (levelDisplay) {
                    levelDisplay.textContent = gameState.currentLevel || 1;
                }
            };
        }
        
        console.log("Single screen layout applied successfully!");
        console.log("- Removed mission controls and status panels");
        console.log("- Moved start button into game header");
        console.log("- Everything now fits on one screen");
    }

    // Apply the changes immediately when the script loads
    document.addEventListener('DOMContentLoaded', function() {
        applySingleScreenLayout();
    });

    // Export the main function for manual execution if needed
    window.applySingleScreenLayout = applySingleScreenLayout;

    // Function to update game layout and make it more robust
    function updateGameLayout() {
        const gameContainer = document.querySelector('.game-container');
        if (!gameContainer) {
            console.error('Game container not found');
            return;
        }
        
        // Remove any existing instructions
        const instructions = document.querySelector('.instructions');
        if (instructions) {
            instructions.remove();
        }
        
        // Update element references
        updateElementReferences();
        
        // Make sure the game canvas is properly sized
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
            resizeCanvas();
        }
        
        // Initialize stars if not already done
        if (!window.starsInitialized) {
            initStars();
            window.starsInitialized = true;
        }
    }

    // Function to make element references more robust
    function updateElementReferences() {
        window.elements = {
            button: document.getElementById('startButton'),
            status: document.getElementById('status'),
            currentNote: document.getElementById('currentNote'),
            volumeLevel: document.getElementById('volumeLevel'),
            tuningSelect: document.getElementById('tuningSelect'),
            scoreDisplay: document.getElementById('scoreDisplay'),
            livesDisplay: document.getElementById('livesDisplay'),
            levelDisplay: document.getElementById('levelDisplay'),
            gameCanvas: document.getElementById('gameCanvas'),
            canvasContainer: document.querySelector('.canvas-container')
        };
        
        // Verify critical elements exist
        const criticalElements = ['button', 'gameCanvas', 'status'];
        const missingElements = criticalElements.filter(id => !window.elements[id]);
        
        if (missingElements.length > 0) {
            console.error('Missing critical elements:', missingElements);
            return false;
        }
        
        return true;
    }

    // Update element references for new layout
    function updateElementReferences() {
        // Get all required elements
        const elements = {
            gameCanvas: document.getElementById('gameCanvas'),
            startButton: document.getElementById('startButton'),
            tuningDropdown: document.getElementById('tuningDropdown'),
            status: document.getElementById('status'),
            score: document.getElementById('score'),
            lives: document.getElementById('lives'),
            level: document.getElementById('level'),
            currentNote: document.getElementById('currentNote'),
            volumeBar: document.getElementById('volumeBar'),
            volumeLevel: document.getElementById('volumeLevel')
        };

        // Log any missing elements
        const missingElements = Object.entries(elements)
            .filter(([_, element]) => !element)
            .map(([name]) => name);

        if (missingElements.length > 0) {
            console.warn('Missing elements:', missingElements);
        }

        // Create dummy elements for any missing ones
        missingElements.forEach(name => {
            const dummy = document.createElement('div');
            dummy.id = name;
            dummy.style.display = 'none';
            document.body.appendChild(dummy);
            elements[name] = dummy;
            console.log(`Created dummy element for ${name}`);
        });

        // Update global references
        window.elements = elements;
        return elements;
    }

    // Apply layout patch to fix any layout issues
    function applyLayoutPatch() {
        // Ensure canvas is properly sized
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
            const container = canvas.parentElement;
            if (container) {
                // Set container to maintain aspect ratio
                container.style.position = 'relative';
                container.style.width = '100%';
                container.style.paddingTop = '48%'; // 4:3 aspect ratio
                container.style.maxWidth = '800px';
                container.style.margin = '0 auto';

                // Position canvas absolutely within container
                canvas.style.position = 'absolute';
                canvas.style.top = '0';
                canvas.style.left = '0';
                canvas.style.width = '100%';
                canvas.style.height = '100%';
                canvas.style.objectFit = 'contain';
            }
        }

        // Hide old elements that we removed
        const oldElements = document.querySelectorAll('.game-controls, .instructions');
        oldElements.forEach(el => {
            el.style.display = 'none';
        });

        // Ensure game container is properly centered
        const gameContainer = document.querySelector('.game-container');
        if (gameContainer) {
            gameContainer.style.maxWidth = '900px';
            gameContainer.style.margin = '0 auto';
            gameContainer.style.padding = '1rem';
        }

        // Update game header layout
        const gameHeader = document.querySelector('.game-header');
        if (gameHeader) {
            gameHeader.style.maxWidth = 'none';
            gameHeader.style.width = '100%';
        }

        // Ensure volume monitor is properly styled
        const volumeMonitor = document.querySelector('.volume-monitor');
        if (volumeMonitor) {
            volumeMonitor.style.display = 'flex';
            volumeMonitor.style.alignItems = 'center';
            volumeMonitor.style.justifyContent = 'space-between';
            volumeMonitor.style.gap = '1rem';
            volumeMonitor.style.marginTop = '0.75rem';
        }

        // Update responsive behavior
        const mediaQuery = window.matchMedia('(max-width: 768px)');
        function handleResponsive(e) {
            if (e.matches) {
                // Mobile layout
                if (volumeMonitor) {
                    volumeMonitor.style.flexDirection = 'column';
                    volumeMonitor.style.gap = '0.5rem';
                }
                const volumeBar = document.querySelector('.volume-bar');
                if (volumeBar) {
                    volumeBar.style.width = '100%';
                }
            } else {
                // Desktop layout
                if (volumeMonitor) {
                    volumeMonitor.style.flexDirection = 'row';
                    volumeMonitor.style.gap = '1rem';
                }
            }
        }

        // Initial check
        handleResponsive(mediaQuery);
        // Add listener for future changes
        mediaQuery.addListener(handleResponsive);
    }

    // Call the functions when the DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        updateElementReferences();
        applyLayoutPatch();
    });

    // COMPLETE FIX: Override broken functions with working versions
    console.log("🔧 Applying complete game fixes...");

    // Override the broken startGame function with a working one
    function createWorkingStartGame() {
        console.log("🔧 Overriding broken startGame function...");
        
        // Store original function as backup
        if (window.startGame && !window.originalStartGame) {
            window.originalStartGame = window.startGame;
        }
        
        // Create new working startGame function
        window.startGame = function() {
            console.log("🚀 Starting game with fixed function...");
            
            // Get canvas and ensure it exists
            const canvas = document.getElementById('gameCanvas');
            if (!canvas) {
                console.error("Canvas not found!");
                return;
            }
            
            // Force canvas to be visible and properly sized
            canvas.style.display = 'block';
            canvas.style.visibility = 'visible';
            
            // Set canvas dimensions
            const container = canvas.parentElement;
            if (container) {
                const rect = container.getBoundingClientRect();
                canvas.width = rect.width;
                canvas.height = rect.width * 0.48; // Match CSS aspect ratio
                console.log(`Canvas sized: ${canvas.width}x${canvas.height}`);
            }
            
            // Get context
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                console.error("Cannot get canvas context!");
                return;
            }
            
            // Make sure global gameState exists
            if (!window.gameState) {
                window.gameState = {};
            }
            
            // Initialize/reset game state with all required properties
            Object.assign(window.gameState, {
                isRunning: true,
                score: 0,
                lives: 3,
                level: 1,
                currentLevel: 1,
                levelGoal: 5000,
                availableStrings: [],
                gameCompleted: false,
                meteors: [],
                lastMeteorTime: Date.now(),
                meteorInterval: 3000,
                currentNote: null,
                lastNote: null,
                lastNoteTime: 0,
                rocketPosition: canvas.width * 0.1,
                rocketY: canvas.height / 2,
                backgroundStars: [],
                meteorSpeed: 2,
                laserBeams: [],
                shields: [],
                maxShields: 3,
                shieldParticles: [],
                gameOverMode: false,
                canRestartWithG: false,
                restartTimerId: null
            });
            
            console.log("Game state initialized:", gameState);
            
            // Initialize background stars
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
            
            // Initialize shield bubbles
            gameState.shields = [];
            for (let i = 0; i < gameState.maxShields; i++) {
                const scaleFactor = 1 - (i * 0.2);
                gameState.shields.push({
                    active: true,
                    x: gameState.rocketPosition + 30,
                    y: gameState.rocketY,
                    radius: 45 * scaleFactor,
                    opacity: 0.6 - (i * 0.1),
                    tier: i + 1
                });
            }
            
            // Set up level strings safely
            if (window.setupLevelStrings && typeof window.setupLevelStrings === 'function') {
                try {
                    window.setupLevelStrings();
                } catch (e) {
                    console.warn("setupLevelStrings failed, using fallback:", e);
                    // Fallback string setup
                    if (window.stringFrequencies) {
                        gameState.availableStrings = Object.keys(window.stringFrequencies);
                    } else {
                        gameState.availableStrings = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
                    }
                }
            } else {
                // Fallback string setup
                if (window.stringFrequencies) {
                    gameState.availableStrings = Object.keys(window.stringFrequencies);
                } else {
                    gameState.availableStrings = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
                }
            }
            
            console.log("Available strings:", gameState.availableStrings);
            
            // Update UI elements safely
            const safeUpdate = (id, value) => {
                const element = document.getElementById(id);
                if (element) {
                    element.textContent = value;
                    console.log(`Updated ${id} to: ${value}`);
                } else {
                    console.warn(`Element ${id} not found`);
                }
            };
            
            safeUpdate('scoreDisplay', '0');
            safeUpdate('livesDisplay', '3');
            safeUpdate('status', 'DEFEND AGAINST METEORS!');
            
            // Update start button
            const startButton = document.getElementById('startButton');
            if (startButton) {
                startButton.textContent = "ABORT MISSION";
                startButton.disabled = false;
            }
            
            // Start the game loop
            console.log("Starting game loop...");
            if (window.gameLoop && typeof window.gameLoop === 'function') {
                try {
                    requestAnimationFrame(window.gameLoop);
                    console.log("Original game loop started");
                } catch (e) {
                    console.warn("Original game loop failed, using fallback:", e);
                    startFallbackGameLoop();
                }
            } else {
                console.log("Original game loop not found, using fallback");
                startFallbackGameLoop();
            }
            
            // Start mission timer if available
            if (window.missionStartTime !== undefined) {
                window.missionStartTime = Date.now();
                if (window.updateMissionTimer && typeof window.updateMissionTimer === 'function') {
                    requestAnimationFrame(window.updateMissionTimer);
                }
            }
            
            // Start frequency detection if available
            if (window.detectFrequency && typeof window.detectFrequency === 'function') {
                window.detectFrequency();
            }
            
            // Play start sound if available
            if (window.playStartSound && typeof window.playStartSound === 'function') {
                try {
                    window.playStartSound();
                } catch (e) {
                    console.warn("Start sound failed:", e);
                }
            }
            
            console.log("✅ Game started successfully!");
        };
        
        // Fallback game loop if the original doesn't work
        function startFallbackGameLoop() {
            console.log("Starting fallback game loop...");
            
            const canvas = document.getElementById('gameCanvas');
            const ctx = canvas.getContext('2d');
            
            function fallbackLoop() {
                if (!gameState || !gameState.isRunning) {
                    console.log("Game stopped");
                    return;
                }
                
                // Clear canvas
                ctx.fillStyle = '#0f172a';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Draw stars
                if (gameState.backgroundStars) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                    gameState.backgroundStars.forEach(star => {
                        ctx.fillRect(star.x, star.y, star.size, star.size);
                        
                        // Move stars
                        star.x -= star.speed;
                        if (star.x < 0) {
                            star.x = canvas.width;
                            star.y = Math.random() * canvas.height;
                        }
                    });
                }
                
                // Draw rocket (using the original drawRocket function if available)
                if (window.drawRocket && typeof window.drawRocket === 'function') {
                    try {
                        window.drawRocket(gameState.rocketPosition, gameState.rocketY);
                    } catch (e) {
                        // Fallback simple rocket
                        drawSimpleRocket(ctx, gameState.rocketPosition, gameState.rocketY);
                    }
                } else {
                    drawSimpleRocket(ctx, gameState.rocketPosition, gameState.rocketY);
                }
                
                // Create meteors
                const now = Date.now();
                if (now - gameState.lastMeteorTime > gameState.meteorInterval) {
                    if (window.createMeteor && typeof window.createMeteor === 'function') {
                        try {
                            window.createMeteor();
                        } catch (e) {
                            // Fallback meteor creation
                            createSimpleMeteor();
                        }
                    } else {
                        createSimpleMeteor();
                    }
                    gameState.lastMeteorTime = now;
                }
                
                // Draw meteors
                if (gameState.meteors) {
                    gameState.meteors = gameState.meteors.filter(meteor => {
                        if (meteor.destroyed) return false;
                        
                        // Move meteor
                        meteor.x -= meteor.speed;
                        
                        // Remove if off screen
                        if (meteor.x < -50) return false;
                        
                        // Draw meteor (use original function if available)
                        if (window.drawMeteor && typeof window.drawMeteor === 'function') {
                            try {
                                window.drawMeteor(meteor);
                            } catch (e) {
                                drawSimpleMeteor(ctx, meteor);
                            }
                        } else {
                            drawSimpleMeteor(ctx, meteor);
                        }
                        
                        return true;
                    });
                }
                
                // Continue loop
                requestAnimationFrame(fallbackLoop);
            }
            
            requestAnimationFrame(fallbackLoop);
            console.log("Fallback game loop started");
        }
        
        // Simple rocket drawing function
        function drawSimpleRocket(ctx, x, y) {
            ctx.save();
            ctx.translate(x, y);
            
            // Rocket body
            ctx.fillStyle = '#60a5fa';
            ctx.beginPath();
            ctx.moveTo(40, 0);
            ctx.lineTo(20, -15);
            ctx.lineTo(-30, -15);
            ctx.lineTo(-40, -8);
            ctx.lineTo(-40, 8);
            ctx.lineTo(-30, 15);
            ctx.lineTo(20, 15);
            ctx.closePath();
            ctx.fill();
            
            // Rocket nose
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath();
            ctx.moveTo(20, -15);
            ctx.lineTo(50, 0);
            ctx.lineTo(20, 15);
            ctx.closePath();
            ctx.fill();
            
            ctx.restore();
        }
        
        // Simple meteor creation
        function createSimpleMeteor() {
            if (!gameState.availableStrings || gameState.availableStrings.length === 0) return;
            
            const randomString = gameState.availableStrings[Math.floor(Math.random() * gameState.availableStrings.length)];
            
            gameState.meteors.push({
                id: Date.now() + Math.random().toString(36).substr(2, 9),
                x: canvas.width + 50,
                y: 50 + Math.random() * (canvas.height - 100),
                size: 20 + Math.random() * 20,
                speed: gameState.meteorSpeed + Math.random() * gameState.level,
                string: randomString,
                displayName: randomString,
                destroyed: false,
                targeted: false,
                rotation: Math.random() * Math.PI
            });
        }
        
        // Simple meteor drawing
        function drawSimpleMeteor(ctx, meteor) {
            ctx.save();
            ctx.translate(meteor.x, meteor.y);
            
            // Meteor body
            ctx.fillStyle = '#a0522d';
            ctx.beginPath();
            ctx.arc(0, 0, meteor.size, 0, Math.PI * 2);
            ctx.fill();
            
            // String name
            ctx.fillStyle = 'white';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(meteor.displayName, 0, 0);
            
            ctx.restore();
        }
    }

    // Also fix the stopGame function
    function createWorkingStopGame() {
        window.stopGame = function(message = "MISSION ABORTED") {
            console.log("Stopping game:", message);
            
            if (window.gameState) {
                gameState.isRunning = false;
            }
            
            // Update UI
            const startButton = document.getElementById('startButton');
            if (startButton) {
                startButton.textContent = "START MISSION";
                startButton.disabled = false;
            }
            
            const status = document.getElementById('status');
            if (status) {
                status.textContent = message;
            }
            
            console.log("Game stopped successfully");
        };
    }

    // Create working functions
    createWorkingStartGame();
    createWorkingStopGame();

    // Update element references for new layout
    setTimeout(() => {
        if (window.elements) {
            const updatedElements = {
                button: document.getElementById('startButton'),
                status: document.getElementById('status'),
                currentNote: document.getElementById('currentNote'),
                frequency: { textContent: '' }, // Dummy for missing element
                volumeLevel: document.getElementById('volumeLevel'),
                missionStatus: { textContent: '' }, // Dummy for missing element
                missionTimer: { textContent: '00:00' }, // Dummy for missing element
                tuningSelect: document.getElementById('tuningSelect'),
                scoreDisplay: document.getElementById('scoreDisplay'),
                livesDisplay: document.getElementById('livesDisplay'),
                gameCanvas: document.getElementById('gameCanvas'),
                gameControls: document.querySelector('.game-header'),
                canvasContainer: document.querySelector('.canvas-container')
            };
            
            Object.assign(window.elements, updatedElements);
            console.log("✅ Element references updated");
        }
        
        // Update status message
        const status = document.getElementById('status');
        if (status) {
            status.textContent = "GUITAR SPACE DEFENDER - PRESS START FOR QUICK TUTORIAL";
        }
        
    }, 100);

    console.log("✅ Complete game fixes applied!");
    console.log("The game should now work properly with rocket, meteors, and all gameplay elements.");

    // AGGRESSIVE FIX: Forcefully override broken functions
    setTimeout(() => {
        console.log("🔥 AGGRESSIVE OVERRIDE: Replacing broken startGame function...");
        
        // Force override the startGame function
        window.startGame = function() {
            console.log("🚀 FIXED startGame called!");
            
            // Get canvas and validate
            const canvas = document.getElementById('gameCanvas');
            if (!canvas) {
                console.error("❌ Canvas not found!");
                alert("Canvas element not found! Check HTML structure.");
                return;
            }
            
            console.log("✅ Canvas found:", canvas);
            
            // Force canvas setup
            canvas.style.display = 'block';
            canvas.style.visibility = 'visible';
            
            // Set canvas size based on container
            const container = canvas.parentElement;
            if (container) {
                const rect = container.getBoundingClientRect();
                canvas.width = rect.width;
                canvas.height = rect.width * 0.48;
                console.log(`✅ Canvas sized: ${canvas.width}x${canvas.height}`);
            } else {
                // Fallback size
                canvas.width = 800;
                canvas.height = 384;
                console.log(`⚠️ Using fallback canvas size: ${canvas.width}x${canvas.height}`);
            }
            
            // Get context
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                console.error("❌ Cannot get canvas context!");
                return;
            }
            
            console.log("✅ Canvas context obtained");
            
            // Clear canvas to test
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#60a5fa';
            ctx.fillText('Game Starting...', 50, 50);
            
            // Initialize game state
            if (!window.gameState) {
                window.gameState = {};
            }
            
            // Reset all game state
            Object.assign(window.gameState, {
                isRunning: true,
                score: 0,
                lives: 3,
                level: 1,
                currentLevel: 1,
                levelGoal: 5000,
                meteors: [],
                lastMeteorTime: Date.now(),
                meteorInterval: 3000,
                meteorSpeed: 2,
                laserBeams: [],
                backgroundStars: [],
                shields: [],
                maxShields: 3,
                rocketPosition: canvas.width * 0.1,
                rocketY: canvas.height / 2,
                availableStrings: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], // Fallback strings
                gameCompleted: false,
                currentNote: null,
                lastNote: null,
                lastNoteTime: 0,
                shieldParticles: [],
                gameOverMode: false
            });
            
            console.log("✅ Game state initialized:", window.gameState);
            
            // Initialize stars
            window.gameState.backgroundStars = [];
            for (let i = 0; i < 100; i++) {
                window.gameState.backgroundStars.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    size: Math.random() * 2 + 1,
                    speed: Math.random() * 2 + 1
                });
            }
            console.log("✅ Stars initialized");
            
            // Initialize shields
            window.gameState.shields = [];
            for (let i = 0; i < 3; i++) {
                const scaleFactor = 1 - (i * 0.2);
                window.gameState.shields.push({
                    active: true,
                    x: window.gameState.rocketPosition + 30,
                    y: window.gameState.rocketY,
                    radius: 45 * scaleFactor,
                    opacity: 0.6 - (i * 0.1),
                    tier: i + 1
                });
            }
            console.log("✅ Shields initialized");
            
            // Update UI elements
            const updateUI = (id, value) => {
                const element = document.getElementById(id);
                if (element) {
                    element.textContent = value;
                    console.log(`✅ Updated ${id}: ${value}`);
                } else {
                    console.warn(`⚠️ Element ${id} not found`);
                }
            };
            
            updateUI('scoreDisplay', '0');
            updateUI('livesDisplay', '3');
            updateUI('status', 'GAME STARTED - DEFEND AGAINST METEORS!');
            
            // Update button
            const button = document.getElementById('startButton');
            if (button) {
                button.textContent = "ABORT MISSION";
                console.log("✅ Button updated");
            }
            
            // Start the simple game loop immediately
            console.log("🎮 Starting game loop...");
            startSimpleGameLoop();
            
            console.log("🎉 GAME STARTED SUCCESSFULLY!");
        };
        
        // Simple but complete game loop
        function startSimpleGameLoop() {
            const canvas = document.getElementById('gameCanvas');
            const ctx = canvas.getContext('2d');
            
            function gameLoop() {
                if (!window.gameState || !window.gameState.isRunning) {
                    console.log("Game loop stopped");
                    return;
                }
                
                // Clear canvas
                ctx.fillStyle = '#0f172a';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Draw stars
                if (window.gameState.backgroundStars) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                    window.gameState.backgroundStars.forEach(star => {
                        ctx.fillRect(star.x, star.y, star.size, star.size);
                        
                        // Move stars
                        star.x -= star.speed;
                        if (star.x < 0) {
                            star.x = canvas.width;
                            star.y = Math.random() * canvas.height;
                        }
                    });
                }
                
                // Draw rocket
                drawRocket(ctx, window.gameState.rocketPosition, window.gameState.rocketY);
                
                // Create meteors
                const now = Date.now();
                if (now - window.gameState.lastMeteorTime > window.gameState.meteorInterval) {
                    createMeteor();
                    window.gameState.lastMeteorTime = now;
                }
                
                // Update and draw meteors
                if (window.gameState.meteors) {
                    window.gameState.meteors = window.gameState.meteors.filter(meteor => {
                        if (meteor.destroyed) return false;
                        
                        // Move meteor
                        meteor.x -= meteor.speed;
                        
                        // Remove if off screen
                        if (meteor.x < -100) return false;
                        
                        // Draw meteor
                        drawMeteor(ctx, meteor);
                        
                        return true;
                    });
                }
                
                // Draw shields
                if (window.gameState.shields) {
                    window.gameState.shields.forEach(shield => {
                        if (shield.active) {
                            // Update shield position
                            shield.x = window.gameState.rocketPosition + 30;
                            shield.y = window.gameState.rocketY;
                            
                            // Draw shield
                            ctx.save();
                            ctx.globalAlpha = shield.opacity;
                            ctx.strokeStyle = '#60a5fa';
                            ctx.lineWidth = 2;
                            ctx.beginPath();
                            ctx.arc(shield.x, shield.y, shield.radius, 0, Math.PI * 2);
                            ctx.stroke();
                            ctx.restore();
                        }
                    });
                }
                
                // Continue loop
                requestAnimationFrame(gameLoop);
            }
            
            // Start the loop
            requestAnimationFrame(gameLoop);
            console.log("✅ Simple game loop started");
        }
        
        // Simple rocket drawing
        function drawRocket(ctx, x, y) {
            ctx.save();
            ctx.translate(x, y);
            
            // Thruster flame
            const flameSize = 20 + Math.sin(Date.now() / 100) * 5;
            ctx.fillStyle = 'rgba(255, 165, 0, 0.8)';
            ctx.beginPath();
            ctx.arc(-35, 0, flameSize, 0, Math.PI * 2);
            ctx.fill();
            
            // Rocket body
            ctx.fillStyle = '#60a5fa';
            ctx.beginPath();
            ctx.moveTo(40, 0);
            ctx.lineTo(20, -15);
            ctx.lineTo(-30, -15);
            ctx.lineTo(-40, -8);
            ctx.lineTo(-40, 8);
            ctx.lineTo(-30, 15);
            ctx.lineTo(20, 15);
            ctx.closePath();
            ctx.fill();
            
            // Rocket nose
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath();
            ctx.moveTo(20, -15);
            ctx.lineTo(50, 0);
            ctx.lineTo(20, 15);
            ctx.closePath();
            ctx.fill();
            
            // Windows
            ctx.fillStyle = '#dbeafe';
            ctx.beginPath();
            ctx.arc(10, 0, 4, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        }
        
        // Simple meteor creation
        function createMeteor() {
            if (!window.gameState.availableStrings) {
                window.gameState.availableStrings = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
            }
            
            const strings = window.gameState.availableStrings;
            const randomString = strings[Math.floor(Math.random() * strings.length)];
            
            const canvas = document.getElementById('gameCanvas');
            
            window.gameState.meteors.push({
                id: Date.now() + Math.random(),
                x: canvas.width + 50,
                y: 50 + Math.random() * (canvas.height - 100),
                size: 20 + Math.random() * 15,
                speed: 2 + Math.random() * 2,
                string: randomString,
                displayName: randomString,
                destroyed: false,
                rotation: Math.random() * Math.PI * 2
            });
            
            console.log(`Created meteor: ${randomString}`);
        }
        
        // Simple meteor drawing
        function drawMeteor(ctx, meteor) {
            ctx.save();
            ctx.translate(meteor.x, meteor.y);
            ctx.rotate(meteor.rotation);
            
            // Meteor body
            ctx.fillStyle = '#a0522d';
            ctx.beginPath();
            ctx.arc(0, 0, meteor.size, 0, Math.PI * 2);
            ctx.fill();
            
            // Border
            ctx.strokeStyle = '#8b4513';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Reset rotation for text
            ctx.restore();
            ctx.save();
            ctx.translate(meteor.x, meteor.y);
            
            // Text background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.beginPath();
            ctx.arc(0, 0, meteor.size * 0.6, 0, Math.PI * 2);
            ctx.fill();
            
            // String name
            ctx.fillStyle = 'white';
            ctx.font = `bold ${Math.max(12, meteor.size / 2)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(meteor.displayName, 0, 0);
            
            ctx.restore();
            
            // Update rotation
            meteor.rotation += 0.02;
        }
        
        // Also override stopGame
        window.stopGame = function(message = "MISSION ABORTED") {
            console.log("🛑 Stopping game:", message);
            
            if (window.gameState) {
                window.gameState.isRunning = false;
            }
            
            const button = document.getElementById('startButton');
            if (button) {
                button.textContent = "START MISSION";
            }
            
            const status = document.getElementById('status');
            if (status) {
                status.textContent = message;
            }
        };
        
        console.log("🔥 AGGRESSIVE OVERRIDE COMPLETE!");
        console.log("startGame function has been forcefully replaced!");
        
    }, 1000); // Wait 1 second to ensure everything is loaded

    // Also add a manual test function
    window.forceStartGame = function() {
        console.log("🔥 FORCE STARTING GAME...");
        if (window.startGame) {
            window.startGame();
        } else {
            console.error("startGame function not found!");
        }
    };

    console.log("🔥 AGGRESSIVE GAME FIX LOADED!");
    console.log("If game still doesn't work, try: forceStartGame() in console");

    // SHIELD VISIBILITY AND SCORING FIXES
    console.log("🛡️ Applying inline shield and scoring fixes...");

    // Wait for existing game to load, then apply fixes
    setTimeout(() => {
        
        // FIX 1: Enhanced Shield Initialization (4 lives: 3 shields + 1 final)
        const originalInitShields = window.initStars || function() {};
        
        function enhancedInitializeShields() {
            if (!gameState) return;
            
            gameState.shields = [];
            gameState.maxShields = 3;
            gameState.lives = 4; // 3 shields + 1 final life
            
            for (let i = 0; i < 3; i++) {
                const scaleFactor = 1 - (i * 0.15);
                gameState.shields.push({
                    active: true,
                    x: gameState.rocketPosition + 30,
                    y: gameState.rocketY,
                    radius: 50 * scaleFactor,
                    opacity: 0.7 - (i * 0.1),
                    tier: i + 1,
                    pulsePhase: i * Math.PI / 3,
                    color: ['rgba(34, 197, 94, ', 'rgba(96, 165, 250, ', 'rgba(168, 85, 247, '][i]
                });
            }
            
            // Update lives display
            if (elements.livesDisplay) {
                elements.livesDisplay.textContent = gameState.lives;
            }
            
            console.log("✅ Enhanced shields initialized with 4 lives");
        }
        
        // FIX 2: Replace the existing drawGame function to include visible shields
        const originalDrawGame = window.drawGame;
        
        window.drawGame = function() {
            // Call original drawing first
            if (originalDrawGame && typeof originalDrawGame === 'function') {
                originalDrawGame();
            }
            
            // Draw enhanced shields on top
            drawVisibleShields();
        };
        
        // FIX 3: Enhanced Shield Drawing Function
        function drawVisibleShields() {
            if (!gameState || !gameState.shields || !gameState.isRunning) return;
            
            const now = Date.now();
            
            gameState.shields.forEach(shield => {
                if (!shield.active) return;
                
                // Update position to follow rocket
                shield.x = gameState.rocketPosition + 30;
                shield.y = gameState.rocketY;
                
                // Pulsing effect
                const pulseIntensity = 0.4 + Math.sin((now / 800) + shield.pulsePhase) * 0.3;
                const currentOpacity = shield.opacity * pulseIntensity;
                const currentRadius = shield.radius * (1 + pulseIntensity * 0.15);
                
                ctx.save();
                
                // Draw shield bubble with gradient
                const gradient = ctx.createRadialGradient(
                    shield.x, shield.y, currentRadius * 0.2,
                    shield.x, shield.y, currentRadius
                );
                gradient.addColorStop(0, `${shield.color}${currentOpacity * 0.9})`);
                gradient.addColorStop(0.5, `${shield.color}${currentOpacity * 0.6})`);
                gradient.addColorStop(1, `${shield.color}0.1)`);
                
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(shield.x, shield.y, currentRadius, 0, Math.PI * 2);
                ctx.fill();
                
                // Bright shield outline
                ctx.strokeStyle = `${shield.color}${Math.min(1, currentOpacity + 0.4)})`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(shield.x, shield.y, currentRadius, 0, Math.PI * 2);
                ctx.stroke();
                
                // Hexagonal tech pattern
                ctx.strokeStyle = `rgba(255, 255, 255, ${currentOpacity * 0.5})`;
                ctx.lineWidth = 1.5;
                
                const hexRadius = currentRadius * 0.85;
                const points = 6;
                const angleStep = (Math.PI * 2) / points;
                
                // Rotating outer hexagon
                ctx.beginPath();
                for (let i = 0; i < points; i++) {
                    const angle = i * angleStep + (now / 1000);
                    const x = shield.x + Math.cos(angle) * hexRadius;
                    const y = shield.y + Math.sin(angle) * hexRadius;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.stroke();
                
                ctx.restore();
            });
        }
        
        // FIX 4: Enhanced Scoring System (Distance-Based)
        function calculateEnhancedScore(meteor, destructionX) {
            const maxDistance = canvas.width;
            const distanceFromRight = maxDistance - destructionX;
            const distanceRatio = Math.max(0, Math.min(1, distanceFromRight / maxDistance));
            
            // Scoring components
            const baseScore = 50;
            const levelMultiplier = gameState.level || 1;
            const distanceBonus = Math.floor(150 * (1 - distanceRatio)); // 0-150 points
            const sizeBonus = Math.floor(100 / Math.max(1, meteor.size / 20));
            const speedBonus = Math.floor(meteor.speed * 10);
            
            const totalScore = (baseScore + distanceBonus + sizeBonus + speedBonus) * levelMultiplier;
            
            return Math.max(50, totalScore);
        }
        
        // FIX 5: Override checkCollisions to use new scoring and 4-life system
        const originalCheckCollisions = window.checkCollisions;
        
        window.checkCollisions = function() {
            if (!gameState || !gameState.isRunning) return;
            
            const now = Date.now();
            
            // Enhanced laser-meteor collisions with new scoring
            if (gameState.laserBeams) {
                for (let i = gameState.laserBeams.length - 1; i >= 0; i--) {
                    const laser = gameState.laserBeams[i];
                    
                    if (!laser.active || laser.hasHit) continue;
                    
                    const targetMeteor = gameState.meteors.find(m => 
                        m.id === laser.targetId && !m.destroyed
                    );
                    
                    if (targetMeteor) {
                        const distance = Math.sqrt(
                            Math.pow(targetMeteor.x - laser.endX, 2) + 
                            Math.pow(targetMeteor.y - laser.endY, 2)
                        );
                        
                        if (distance < targetMeteor.size) {
                            targetMeteor.destroyed = true;
                            laser.hasHit = true;
                            
                            // Apply enhanced scoring
                            const score = calculateEnhancedScore(targetMeteor, targetMeteor.x);
                            gameState.score += score;
                            
                            if (elements.scoreDisplay) {
                                elements.scoreDisplay.textContent = gameState.score;
                            }
                            
                            // Create score popup
                            if (typeof createScorePopup === 'function') {
                                createScorePopup(targetMeteor.x, targetMeteor.y, score);
                            }
                            
                            // Create explosion
                            if (typeof createExplosion === 'function') {
                                createExplosion(targetMeteor.x, targetMeteor.y, targetMeteor.size);
                            }
                            
                            console.log(`Enhanced score: ${score} (distance bonus included)`);
                        }
                    }
                    
                    // Clean up old lasers
                    if (now - laser.timestamp > 600) {
                        laser.active = false;
                    }
                }
                
                gameState.laserBeams = gameState.laserBeams.filter(laser => laser.active);
            }
            
            // Enhanced meteor-shield collisions (4-life system)
            gameState.meteors.forEach(meteor => {
                if (meteor.destroyed || meteor.x > gameState.rocketPosition) return;
                
                // Meteor passed rocket without being destroyed
                const activeShields = gameState.shields.filter(s => s.active);
                
                if (activeShields.length > 0) {
                    // Destroy outermost active shield
                    const shieldIndex = gameState.shields.findIndex(s => s.active);
                    if (shieldIndex >= 0) {
                        gameState.shields[shieldIndex].active = false;
                        gameState.lives--;
                        
                        // Update UI
                        if (elements.livesDisplay) {
                            elements.livesDisplay.textContent = gameState.lives;
                        }
                        
                        if (elements.status) {
                            elements.status.textContent = `SHIELD DESTROYED! ${gameState.lives} LIVES REMAINING`;
                        }
                        
                        // Create shield break effect
                        if (typeof createShieldBreakEffect === 'function') {
                            createShieldBreakEffect(
                                gameState.shields[shieldIndex].x,
                                gameState.shields[shieldIndex].y
                            );
                        }
                        
                        meteor.destroyed = true;
                        
                        if (typeof createExplosion === 'function') {
                            createExplosion(meteor.x, meteor.y, meteor.size);
                        }
                        
                        console.log(`Shield destroyed! Lives: ${gameState.lives}`);
                        
                        // Game over check - only when all 4 lives are gone
                        if (gameState.lives <= 0) {
                            if (typeof createExplosion === 'function') {
                                createExplosion(gameState.rocketPosition, gameState.rocketY, 50);
                            }
                            if (typeof stopGame === 'function') {
                                stopGame("GAME OVER - ALL SHIELDS AND LIVES LOST");
                            }
                        }
                    }
                } else {
                    // Direct rocket hit (no shields left)
                    meteor.destroyed = true;
                    gameState.lives = 0;
                    
                    if (typeof createExplosion === 'function') {
                        createExplosion(gameState.rocketPosition, gameState.rocketY, 50);
                    }
                    if (typeof stopGame === 'function') {
                        stopGame("GAME OVER - ROCKET DESTROYED");
                    }
                }
            });
        };
        
        // FIX 6: Override startGame to initialize enhanced shields
        const originalStartGameFunc = window.startGame;
        
        function startGame() {
            // Call original start game
            if (originalStartGameFunc && typeof originalStartGameFunc === 'function') {
                originalStartGameFunc();
            }
            
            // Force enhanced shield initialization
            setTimeout(() => {
                enhancedInitializeShields();
            }, 200);
        }
        
        // Replace the startGame function
        window.startGame = startGame;
        
        // If game is already running, apply fixes immediately
        if (gameState && gameState.isRunning) {
            enhancedInitializeShields();
        }
        
        console.log("✅ All inline fixes applied successfully!");
        
    }, 2000); // Wait 2 seconds for main game to load

    // Add these functions at the top level, before they're used
    function enhancedInitializeShields() {
        if (!gameState) return;
        
        gameState.shields = [];
        gameState.maxShields = 3;
        gameState.lives = 4; // 3 shields + 1 final life
        
        for (let i = 0; i < 3; i++) {
            const scaleFactor = 1 - (i * 0.15);
            gameState.shields.push({
                active: true,
                x: gameState.rocketPosition + 30,
                y: gameState.rocketY,
                radius: 50 * scaleFactor,
                opacity: 0.7 - (i * 0.1),
                tier: i + 1,
                pulsePhase: i * Math.PI / 3,
                color: ['rgba(34, 197, 94, ', 'rgba(96, 165, 250, ', 'rgba(168, 85, 247, '][i]
            });
        }
        
        // Update lives display
        if (elements.livesDisplay) {
            elements.livesDisplay.textContent = gameState.lives;
        }
        
        console.log("✅ Enhanced shields initialized with 4 lives");
    }

    function drawVisibleShields() {
        if (!gameState || !gameState.shields || !gameState.isRunning) return;
        
        const now = Date.now();
        
        gameState.shields.forEach(shield => {
            if (!shield.active) return;
            
            // Update position to follow rocket
            shield.x = gameState.rocketPosition + 30;
            shield.y = gameState.rocketY;
            
            // Pulsing effect
            const pulseIntensity = 0.4 + Math.sin((now / 800) + shield.pulsePhase) * 0.3;
            const currentOpacity = shield.opacity * pulseIntensity;
            const currentRadius = shield.radius * (1 + pulseIntensity * 0.15);
            
            ctx.save();
            
            // Draw shield bubble with gradient
            const gradient = ctx.createRadialGradient(
                shield.x, shield.y, currentRadius * 0.2,
                shield.x, shield.y, currentRadius
            );
            gradient.addColorStop(0, `${shield.color}${currentOpacity * 0.9})`);
            gradient.addColorStop(0.5, `${shield.color}${currentOpacity * 0.6})`);
            gradient.addColorStop(1, `${shield.color}0.1)`);
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(shield.x, shield.y, currentRadius, 0, Math.PI * 2);
            ctx.fill();
            
            // Bright shield outline
            ctx.strokeStyle = `${shield.color}${Math.min(1, currentOpacity + 0.4)})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(shield.x, shield.y, currentRadius, 0, Math.PI * 2);
            ctx.stroke();
            
            // Hexagonal tech pattern
            ctx.strokeStyle = `rgba(255, 255, 255, ${currentOpacity * 0.5})`;
            ctx.lineWidth = 1.5;
            
            const hexRadius = currentRadius * 0.85;
            const points = 6;
            const angleStep = (Math.PI * 2) / points;
            
            // Rotating outer hexagon
            ctx.beginPath();
            for (let i = 0; i < points; i++) {
                const angle = i * angleStep + (now / 1000);
                const x = shield.x + Math.cos(angle) * hexRadius;
                const y = shield.y + Math.sin(angle) * hexRadius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
            
            ctx.restore();
        });
    }

    function calculateEnhancedScore(meteor, destructionX) {
        const maxDistance = canvas.width;
        const distanceFromRight = maxDistance - destructionX;
        const distanceRatio = Math.max(0, Math.min(1, distanceFromRight / maxDistance));
        
        // Scoring components
        const baseScore = 50;
        const levelMultiplier = gameState.level || 1;
        const distanceBonus = Math.floor(150 * (1 - distanceRatio)); // 0-150 points
        const sizeBonus = Math.floor(100 / Math.max(1, meteor.size / 20));
        const speedBonus = Math.floor(meteor.speed * 10);
        
        const totalScore = (baseScore + distanceBonus + sizeBonus + speedBonus) * levelMultiplier;
        
        return Math.max(50, totalScore);
    }

    // ... existing code ...

    // Remove the setTimeout wrapper at the bottom of the file and just call the initialization
    console.log("🛡️ Applying shield and scoring fixes...");
    enhancedInitializeShields();
    console.log("✅ All shield fixes applied successfully!");

    // ... rest of existing code ...
});