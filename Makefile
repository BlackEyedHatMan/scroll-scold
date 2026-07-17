UUID = scroll-scold@blackeyedhatman.com
ZIP  = dist/$(UUID).shell-extension.zip

.PHONY: all schemas pack install uninstall test nested clean

all: pack

schemas:
	glib-compile-schemas src/schemas/

pack:
	mkdir -p dist
	gnome-extensions pack src --force \
		--extra-source=lib \
		--extra-source=prefsPages \
		--extra-source=icons \
		--extra-source=sounds \
		--out-dir=dist

install: pack
	gnome-extensions install --force $(ZIP)
	@echo "Installed. Log out/in (or restart the nested shell) and run:"
	@echo "  gnome-extensions enable $(UUID)"

uninstall:
	gnome-extensions uninstall $(UUID)

test:
	gjs -m tests/testMatcher.js
	gjs -m tests/testSessionEngine.js

# Run a nested GNOME Shell for development (Wayland).
nested:
	MUTTER_DEBUG_DUMMY_MODE_SPECS=1600x900 \
	dbus-run-session -- gnome-shell --nested --wayland

clean:
	rm -rf dist src/schemas/gschemas.compiled
