from .admin import bp as admin_bp
from .auth import bp as auth_bp
from .bus import bp as bus_bp
from .device import bp as device_bp
from .notifications import bp as notifications_bp
from .spa import bp as spa_bp
from .student import bp as student_bp
from .system import bp as system_bp

ALL_BLUEPRINTS = [auth_bp, admin_bp, student_bp, bus_bp, device_bp, notifications_bp, system_bp, spa_bp]
