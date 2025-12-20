.PHONY: setup run clean

setup:
	@echo "Building Docker containers..."
	docker-compose build

run:
	@echo "Starting application at http://localhost:3000"
	docker-compose up

clean:
	docker-compose down -v
	rm -rf storage artifacts
