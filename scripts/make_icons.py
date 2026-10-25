from PIL import Image, ImageDraw
SS=4
POLYS=[([(627,337),(722,487),(555,738),(271,900)],'#FF0D50'),
       ([(271,900),(555,738),(449,900)],'#DC0046'),
       ([(722,487),(625,635),(687,722)],'#99002F'),
       ([(722,487),(979,900),(799,900),(687,722)],'#E8004E')]
CX,CY,W=625,618.5,708
def render(size,frac,bg,SS=4):
    n=size*SS
    im=Image.new('RGBA',(n,n),bg if bg else (0,0,0,0))
    d=ImageDraw.Draw(im)
    s=frac*n/W
    for pts,col in POLYS:
        d.polygon([((x-CX)*s+n/2,(y-CY)*s+n/2) for x,y in pts],fill=col)
    return im.resize((size,size),Image.LANCZOS)
BLACK=(0,0,0,255)
render(1024,0.62,BLACK).convert('RGB').save('resources/icon-only.png')
render(1024,0.46,None).save('resources/icon-foreground.png')
Image.new('RGB',(1024,1024),(0,0,0)).save('resources/icon-background.png')
render(2732,0.22,BLACK,SS=1).convert('RGB').save('resources/splash.png')
render(2732,0.22,BLACK,SS=1).convert('RGB').save('resources/splash-dark.png')
