from pathlib import Path
d=Path('outputs/mdl-prices-20261024')
p=Path('outputs/prime-fc-prices-20261024/update.mjs').read_text(encoding='utf-8')
p=p.replace('outputs/prime-fc-prices-20261024',str(d).replace('\\','/'))
start=p.index('const prices=');end=p.index('\nconst wb=',start)
prices={443:179000,444:29600,445:101000,446:75000,447:46800,448:154000,449:277000,450:352000,451:157000,452:355000,453:96100,454:1800000,455:70300,456:111000,457:39000,458:19900,459:67100,460:115000,461:75700,462:66100,463:18400,464:422000,465:164000,466:128000,467:167000,468:52900,469:145000,470:82800,471:184000,472:68400,473:242000,474:4430,475:80400,476:90300,477:55100,478:234000,479:72400,480:25800,481:72400,482:82800}
import json
p=p[:start]+'const prices='+json.dumps(prices)+';'+p[end:]
p=p.replace("targets.length!==24||targets.some(t=>!['PRIME','FC AMBASSADOR'].includes(t.season))","targets.length!==40||targets.some(t=>t.season!=='MEDALIST')")
p=p.replace("[['prime','A427:J432'],['fc','A473:J481']]","[['mdl','A433:J440']]")
p=p.replace('Verified 15 PRIME and 9 FC prices.','Verified 40 MEDALIST prices.')
(d/'update.mjs').write_text(p,encoding='utf-8')
f=Path('outputs/prime-fc-prices-20261024/finish.py').read_text(encoding='utf-8').replace('outputs/prime-fc-prices-20261024','outputs/mdl-prices-20261024').replace('24 price cells','40 price cells')
(d/'finish.py').write_text(f,encoding='utf-8')
