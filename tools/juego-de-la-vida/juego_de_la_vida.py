# cargamos librerias
import pygame # usamos pygame para mostrar el juego de la vida en una ventana
import numpy as np # usamos numpy para trabajar matrices y funciones matematicas
import time # usamos time para que al actualizarse el tablero, de tiempo de ver la evolución del mismo

# -------------------------- definimos ventana donde se mostrará el juego de la vida --------------------------

pygame.init()
pygame.display.set_caption("Juego de la vida by XAVICO")
height, width = 600, 600
screen = pygame.display.set_mode((height, width))
bg = 32, 16, 38 # escogemos color de fondo
screen.fill(bg) # aplicamos el color de fondo

# definimos número de celdas que queremos mostrar del eje x hasta el eje y
NumCeldasX, NumCeldasY = 35, 35
# ajustamos el alto y ancho de las celdas según la ventana definida
AnchoCelda = width / NumCeldasX
AltoCelda = height / NumCeldasY

#  -------------------------- estados de celda  --------------------------------------------------------------
#                          viva = 1  // muerta = 0

# damos valores aleatorios de vivos y muertos para que cada vez que se inicie el juego sea diferente
EstadoCeldas = np.random.choice([0, 1], size=(NumCeldasX, NumCeldasY))

#  -------------------------- iniciamos el bucle del juego .---------------------------------------------------
generacion = 0
iniciar = True
while iniciar:
    
    # implemento un contador de generaciones para tener en cuenta en que punto del juego estamos
    # haciendo uso de la libreria numpy, añado un contador de células vivas
    generacion += 1
    poblacion = np.sum(EstadoCeldas)
    print('Generación:',generacion,'|| Población:',poblacion)

    # copia del estado actual del juego para posteriormente rellenar las células que esten vivas 
    NuevoEstadoCeldas = np.copy(EstadoCeldas)
    # rellenamos de nuevo las celdas
    screen.fill(bg)
    time.sleep(0.2)

    for y in range(0, NumCeldasX):
        for x in range(0, NumCeldasY):

            # calculamos el número de células vivas hay al rededor de cada celda
            # aplicamos estrategia toroidal, para que los bordes sean un continuo de celdas
            NumVecinos = EstadoCeldas[(x-1) % NumCeldasX,   (y-1) % NumCeldasY] +\
                         EstadoCeldas [(x) % NumCeldasX,    (y-1) % NumCeldasY] +\
                         EstadoCeldas [(x+1) % NumCeldasX,  (y-1) % NumCeldasY] +\
                         EstadoCeldas [(x-1) % NumCeldasX,  (y) % NumCeldasY] +\
                         EstadoCeldas [(x+1) % NumCeldasX,  (y) % NumCeldasY] +\
                         EstadoCeldas [(x-1) % NumCeldasX,  (y+1) % NumCeldasY] +\
                         EstadoCeldas [(x) % NumCeldasX,    (y+1) % NumCeldasY] +\
                         EstadoCeldas [(x+1) % NumCeldasX,  (y+1) % NumCeldasY] 
            
            # ----------------------- reglas del juego de la vida -----------------------
            # REGLA 1: REVIVE una célula muerta con 3 vecinos vivos
            if EstadoCeldas[x, y] == 0 and NumVecinos == 3:
                NuevoEstadoCeldas[x, y] = 1

            # REGLA 2: MUERE una célula viva con menos de 2 o más de 3 vecinos vivos
            elif EstadoCeldas[x, y] == 1 and (NumVecinos < 2 or NumVecinos > 3):
                NuevoEstadoCeldas[x, y] = 0
            # ----------------------------------------------------------------------------

            # dibujamos la cuadricula haciendo uso de cordenadas para el tamaño de celda y uso de la libreria pygame para dibujar las celdas
            poligonos = [((x)   * AnchoCelda, y * AltoCelda),
                         ((x+1) * AnchoCelda, y * AltoCelda),
                         ((x+1) * AnchoCelda, (y+1) * AltoCelda),
                         ((x)   * AnchoCelda, (y+1) * AltoCelda)]
            
            # según el estado de la célula (viva o muerta), se rellenará de un color u otro
            if NuevoEstadoCeldas[x, y] == 0:
                pygame.draw.polygon(screen, (15, 6, 18), poligonos, 1)
            else:
                pygame.draw.polygon(screen, (0, 255, 0), poligonos, 0)
    
    #actualizamos el estado de las celdas
    EstadoCeldas = np.copy(NuevoEstadoCeldas)

    # actualizamos la pantalla
    pygame.display.flip()

    # para poder cerrar la ventana del juego de la vida
    for salir in pygame.event.get():
        if salir.type==pygame.QUIT:
            iniciar = False
pygame.quit()
