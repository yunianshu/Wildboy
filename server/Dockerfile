FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B package -DskipTests
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN groupadd --system wildboy && useradd --system --gid wildboy wildboy
COPY --from=build /app/target/wildboy-server-0.1.0.jar /app/app.jar
USER wildboy
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
