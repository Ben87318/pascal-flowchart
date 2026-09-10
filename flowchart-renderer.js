export class FlowchartRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.NW = 200;
        this.NH = 40;
        this.VGAP = 50;
        this.HGAP = 100;
        this.PAD = 30;
        this.dragging = false;
        this.lx = 0; this.ly = 0;
        this.onZoomChange = null;
        this._events();
    }
    _clampPan(){
        if(this._drawMinX==null || isNaN(this._drawMinX)) return;
        const z=this.zoom;
        const cw=this.container.clientWidth, ch=this.container.clientHeight;
        const drawW=(this._drawMaxX-this._drawMinX)*z;
        const drawH=(this._drawMaxY-this._drawMinY)*z;
        const V=50;
        if(drawW <= cw){
            this.panX = (cw - drawW)/2;
        } else {
            const minX = cw - this._drawMaxX*z - V;
            const maxX = -this._drawMinX*z + V;
            this.panX = Math.max(minX, Math.min(maxX, this.panX));
        }
        if(drawH <= ch){
            this.panY = (ch - drawH)/2;
        } else {
            const minY = ch - this._drawMaxY*z - V;
            const maxY = -this._drawMinY*z + V;
            this.panY = Math.max(minY, Math.min(maxY, this.panY));
        }
    }
    _events() {
        this.container = this.canvas.parentElement;

        // --- DRAG ---
        const startDrag = (ex, ey)=>{
            this.dragging = true;
            this.lx = ex; this.ly = ey;
            this._dragMoved = false;
        };
        const moveDrag = (ex, ey)=>{
            if(!this.dragging) return;
            const dx = ex - this.lx, dy = ey - this.ly;
            if(!this._dragMoved && Math.abs(dx)+Math.abs(dy)<3) return;
            this._dragMoved = true;
            this.panX += dx;
            this.panY += dy;
            this.lx = ex; this.ly = ey;
            this._clampPan();
            this._applyTransform();
        };
        const endDrag = ()=>{
            this.dragging = false;
            this._dragMoved = false;
            document.body.style.cursor = '';
        };

        this.canvas.addEventListener('mousedown', e=>{
            if(e.button!==0) return;
            e.preventDefault();
            document.body.style.cursor = 'grabbing';
            startDrag(e.clientX, e.clientY);
        });
        document.addEventListener('mousemove', e=>{
            moveDrag(e.clientX, e.clientY);
        });
        document.addEventListener('mouseup', endDrag);

        // touch
        this.canvas.addEventListener('touchstart', e=>{
            if(e.touches.length===1){
                e.preventDefault();
                startDrag(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, {passive:false});
        document.addEventListener('touchmove', e=>{
            if(this.dragging && e.touches.length===1){
                e.preventDefault();
                moveDrag(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, {passive:false});
        document.addEventListener('touchend', endDrag);

        // --- ZOOM (wheel on entire flowchart-panel area) ---
        const doZoom = (deltaY, cx, cy)=>{
            const oldZ = this.zoom;
            const step = deltaY > 0 ? -0.1 : 0.1;
            const nz = Math.max(0.15, Math.min(4, this.zoom + step));
            if(nz === oldZ) return;
            // zoom centered at cursor relative to canvas origin
            const r = this.canvas.getBoundingClientRect();
            const mx = cx - r.left;
            const my = cy - r.top;
            this.panX = mx - (mx - this.panX) * (nz / oldZ);
            this.panY = my - (my - this.panY) * (nz / oldZ);
            this.zoom = nz;
            this._clampPan();
            this._applyTransform();
            if(this.onZoomChange) this.onZoomChange(this.zoom);
        };

        this.container.addEventListener('wheel', e=>{
            e.preventDefault();
            doZoom(e.deltaY, e.clientX, e.clientY);
        }, {passive:false});

        // --- DOUBLE CLICK to fit ---
        this.container.addEventListener('dblclick', e=>{
            e.preventDefault();
            this.fitView();
        });
    }
    _applyTransform(){
        this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
        this.canvas.style.transformOrigin = '0 0';
    }
    _redrawCanvas(){
        if(!this.fc) return;
        const c=this.ctx;
        c.clearRect(0,0,this.canvas.width,this.canvas.height);
        c.fillStyle='#fff';
        c.fillRect(0,0,this.canvas.width,this.canvas.height);
        c.save();
        this._drawEdges();
        this.fc.nodes.forEach(n=>this._drawNode(n));
        c.restore();
    }
    render(fc){ this.fc=fc; this._layout(); this._redrawCanvas(); requestAnimationFrame(()=>this.fitView()); }
    _layout(){
        const {nodes}=this.fc, nmap={}; nodes.forEach(n=>nmap[n.id]=n); this.nmap=nmap;
        if(nodes.length===0){
            this.canvas.width=100; this.canvas.height=100;
            this._drawMinX=0; this._drawMaxX=100; this._drawMinY=0; this._drawMaxY=100;
            this._minX=0; this._maxX=100;
            return;
        }
        const hasRC = nodes.every(n=>n.row!==undefined&&n.col!==undefined);
        if(hasRC){
            const baseX=400;
            nodes.forEach(n=>{
                n.w=this.NW; n.h=this.NH;
                n.x=baseX + n.col*(this.NW+this.HGAP);
                n.y=this.PAD + n.row*(this.NH+this.VGAP);
            });
            let minX=Infinity,maxX=-Infinity,maxY=0;
            nodes.forEach(n=>{
                const left=n.type==='decision'? n.x-14 : n.x;
                const right=n.type==='decision'? n.x+n.w+14 : n.x+n.w;
                minX=Math.min(minX,left); maxX=Math.max(maxX,right); maxY=Math.max(maxY,n.y+n.h+14);
            });
            let minY = Infinity;
            nodes.forEach(n=>{ minY = Math.min(minY, n.y - 2); });
            const farMinX = minX - this.HGAP - 60;
            const farMaxX = maxX + this.HGAP + 60;
            const contentW = farMaxX - farMinX;
            this.canvas.width = contentW + this.PAD*2;
            this.canvas.height = maxY + this.PAD + 40;
            const shiftX = (this.canvas.width - contentW)/2 - farMinX;
            nodes.forEach(n=>n.x+=shiftX);
            this._drawMinX = farMinX + shiftX;
            this._drawMaxX = farMaxX + shiftX;
            this._drawMinY = minY;
            this._drawMaxY = maxY;
            this._minX = minX+shiftX; this._maxX = maxX+shiftX;
            return;
        }
        const cx=350; nodes.forEach((n,i)=>{n.w=this.NW; n.h=this.NH; n.x=cx; n.y=this.PAD+i*(this.NH+this.VGAP);});
        this.canvas.width=600; this.canvas.height=this.PAD+nodes.length*(this.NH+this.VGAP)+80;
        this._minX=cx; this._maxX=cx+this.NW;
        this._drawMinX=cx-14; this._drawMaxX=cx+this.NW+14;
        this._drawMinY=this.PAD; this._drawMaxY=this.PAD+nodes.length*(this.NH+this.VGAP);
    }
    fitView(){
        if(!this.fc || this._drawMinX==null) return;
        const cw = this.container.clientWidth;
        const ch = this.container.clientHeight;
        const drawW = this._drawMaxX - this._drawMinX;
        const drawH = this._drawMaxY - this._drawMinY;
        if(!cw || !ch) { this.zoom=1; this.panX=0; this.panY=0; this._applyTransform(); return; }
        const scaleX = (cw - 40) / drawW;
        const scaleY = (ch - 40) / drawH;
        this.zoom = Math.max(0.15, Math.min(2, Math.min(scaleX, scaleY)));
        this.panX = (cw - drawW * this.zoom) / 2 - this._drawMinX * this.zoom;
        this.panY = (ch - drawH * this.zoom) / 2 - this._drawMinY * this.zoom;
        this._applyTransform();
        if(this.onZoomChange) this.onZoomChange(this.zoom);
    }
    setZoom(z){
        const nz = Math.max(0.15, Math.min(4, z));
        const oldZ = this.zoom;
        // zoom centered at center of container
        const cw = this.container.clientWidth, ch = this.container.clientHeight;
        const cx = cw/2, cy = ch/2;
        const r = this.canvas.getBoundingClientRect();
        const mx = cx, my = cy;
        this.panX = mx - (mx - this.panX) * (nz / oldZ);
        this.panY = my - (my - this.panY) * (nz / oldZ);
        this.zoom = nz;
        this._clampPan();
        this._applyTransform();
        if(this.onZoomChange) this.onZoomChange(this.zoom);
    }
    resetView(){
        this.zoom = 1;
        if(this._drawMinX!==undefined){
            const cw = this.container.clientWidth, ch = this.container.clientHeight;
            const drawW = this._drawMaxX - this._drawMinX;
            const drawH = this._drawMaxY - this._drawMinY;
            this.panX = (cw - drawW) / 2 - this._drawMinX;
            this.panY = (ch - drawH) / 2 - this._drawMinY;
        } else {
            this.panX = 0; this.panY = 0;
        }
        this._applyTransform();
        if(this.onZoomChange) this.onZoomChange(this.zoom);
    }
    downloadPNG(){
        const c=document.createElement('canvas'); c.width=this.canvas.width; c.height=this.canvas.height;
        const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); x.drawImage(this.canvas,0,0);
        const a=document.createElement('a'); a.download='flowchart.png'; a.href=c.toDataURL('image/png'); a.click();
    }
    _pt(n, side){
        const cx=n.x+n.w/2, cy=n.y+n.h/2;
        if(n.type==='start'||n.type==='end'){
            const r=20;
            if(side==='top') return {x:cx,y:cy-r};
            if(side==='bottom') return {x:cx,y:cy+r};
            if(side==='left') return {x:cx-r,y:cy};
            if(side==='right') return {x:cx+r,y:cy};
        }
        if(n.type==='decision'){
            const p=14;
            if(side==='top') return {x:cx,y:n.y-p};
            if(side==='bottom') return {x:cx,y:n.y+n.h+p};
            if(side==='left') return {x:n.x-p,y:cy};
            if(side==='right') return {x:n.x+n.w+p,y:cy};
        }
        if(n.type==='for-loop'){
            if(side==='top') return {x:cx,y:n.y};
            if(side==='bottom') return {x:cx,y:n.y+n.h};
            if(side==='left') return {x:n.x,y:cy};
            if(side==='right') return {x:n.x+n.w,y:cy};
        }
        if(n.type==='process' && n.label===''){
            return {x:cx,y:cy};
        }
        if(n.type==='text'){
            if(side==='top') return {x:cx,y:n.y};
            if(side==='bottom') return {x:cx,y:n.y+n.h};
            return {x:cx,y:cy};
        }
        if(side==='top') return {x:cx,y:n.y};
        if(side==='bottom') return {x:cx,y:n.y+n.h};
        if(side==='left') return {x:n.x,y:cy};
        if(side==='right') return {x:n.x+n.w,y:cy};
        return {x:cx,y:cy};
    }
    _drawNode(n){
        const c=this.ctx, {x,y,w,h,type,label}=n, cx=x+w/2, cy=y+h/2;
        c.save(); c.strokeStyle='#000'; c.lineWidth=2; c.fillStyle='#fff'; c.textAlign='center'; c.textBaseline='middle';
        if(type==='start'||type==='end'){
            c.beginPath(); c.arc(cx,cy,20,0,Math.PI*2); c.fill(); c.stroke();
            c.fillStyle='#000'; c.font='bold 16px sans-serif'; c.fillText(label,cx,cy);
        } else if(type==='decision'){
            const p=14;
            c.beginPath(); c.moveTo(cx,y-p); c.lineTo(x+w+p,cy); c.lineTo(cx,y+h+p); c.lineTo(x-p,cy); c.closePath();
            c.fill(); c.stroke();
            c.fillStyle='#000'; c.font='13px sans-serif'; this._text(c,label,cx,cy,w-28);
        } else if(type==='for-loop'){
            const ind=22;
            c.beginPath(); c.moveTo(x+ind,y); c.lineTo(x+w-ind,y); c.lineTo(x+w,cy); c.lineTo(x+w-ind,y+h); c.lineTo(x+ind,y+h); c.lineTo(x,cy); c.closePath();
            c.fill(); c.stroke(); c.fillStyle='#000'; c.font='13px sans-serif'; this._text(c,label,cx,cy,w-32);
        } else if(type==='io'){
            c.beginPath(); c.moveTo(x+16,y); c.lineTo(x+w,y); c.lineTo(x+w-16,y+h); c.lineTo(x,y+h); c.closePath();
            c.fill(); c.stroke(); c.fillStyle='#000'; c.font='13px sans-serif'; this._text(c,label,cx,cy,w-20);
        } else if(type==='sub-process'){
            const m=8;
            c.fillRect(x,y,w,h); c.strokeRect(x,y,w,h);
            c.beginPath(); c.moveTo(x+m,y); c.lineTo(x+m,y+h); c.moveTo(x+w-m,y); c.lineTo(x+w-m,y+h); c.stroke();
            c.fillStyle='#000'; c.font='13px sans-serif'; this._text(c,label,cx,cy,w-20);
        } else if(type==='text'){
            c.fillStyle='#000'; c.font='bold 16px monospace'; this._text(c,label,cx,cy,w-16);
        } else if(type==='process'){
            if(label==='') return;
            else { c.fillRect(x,y,w,h); c.strokeRect(x,y,w,h); c.fillStyle='#000'; c.font='13px sans-serif'; this._text(c,label,cx,cy,w-16); }
        }
        c.restore();
    }
    _drawEdges(){
        const c=this.ctx; c.save(); c.strokeStyle='#000'; c.lineWidth=2; c.fillStyle='#000'; c.font='14px sans-serif'; c.lineCap='square'; c.lineJoin='miter';
        let farRight = this._maxX + this.HGAP;
        let farLeft = this._minX - this.HGAP;
        this.fc.edges.forEach(e=>{
            const f=this.nmap[e.from], t=this.nmap[e.to]; if(!f||!t) return;
            switch(e.type){
                case 'left-branch': this._leftBranch(c,f,t,e.label); break;
                case 'right-branch': this._rightBranch(c,f,t,e.label); break;
                case 'left-merge': this._leftMerge(c,f,t); break;
                case 'right-merge': this._rightMerge(c,f,t); break;
                case 'back': this._back(c,f,t,e.label,farLeft,e.backDepth||0); break;
                case 'no-else-right': this._noElseRight(c,f,t,e.label); break;
                case 'right-exit': this._rightExit(c,f,t,e.label,farRight,e.backDepth||0); break;
                case 'down': this._down(c,f,t,e.label); break;
                case 'chain-right': this._chainRight(c,f,t,e.label); break;
                case 'chain-exit': this._chainExit(c,f,t); break;
                case 'break-exit': this._breakExit(c,f,t,farLeft); break;
                default: this._straight(c,f,t,e.label);
            }
        });
        c.restore();
    }
    _straight(c,f,t,label){
        const a=this._pt(f,'bottom'), b=this._pt(t,'top');
        if(Math.abs(a.x-b.x)<2){
            c.beginPath(); c.moveTo(a.x,a.y); c.lineTo(b.x,b.y); c.stroke();
        } else {
            const midY=(a.y+b.y)/2;
            c.beginPath(); c.moveTo(a.x,a.y); c.lineTo(a.x,midY); c.lineTo(b.x,midY); c.lineTo(b.x,b.y); c.stroke();
        }
        if(!(t.type==='process' && t.label==='')) this._arrow(c,b.x,b.y,'down');
        if(label) c.fillText(label,(a.x+b.x)/2+8,(a.y+b.y)/2);
    }
    _down(c,f,t,label){
        const a=this._pt(f,'bottom'), b=this._pt(t,'top');
        if(Math.abs(a.x-b.x)<2){
            c.beginPath(); c.moveTo(a.x,a.y); c.lineTo(b.x,b.y); c.stroke();
        } else {
            const midY=(a.y+b.y)/2;
            c.beginPath(); c.moveTo(a.x,a.y); c.lineTo(a.x,midY); c.lineTo(b.x,midY); c.lineTo(b.x,b.y); c.stroke();
        }
        if(!(t.type==='process' && t.label==='')) this._arrow(c,b.x,b.y,'down');
        if(label) c.fillText(label,a.x+10,a.y+14);
    }
    _leftBranch(c,f,t,label){
        const a=this._pt(f,'left'), b=this._pt(t,'top');
        c.beginPath(); c.moveTo(a.x,a.y); c.lineTo(b.x,a.y); c.lineTo(b.x,b.y); c.stroke();
        this._arrow(c,b.x,b.y,'down');
        if(label) c.fillText(label, a.x-14, a.y-8);
    }
    _rightBranch(c,f,t,label){
        const a=this._pt(f,'right'), b=this._pt(t,'top');
        c.beginPath(); c.moveTo(a.x,a.y); c.lineTo(b.x,a.y); c.lineTo(b.x,b.y); c.stroke();
        this._arrow(c,b.x,b.y,'down');
        if(label) c.fillText(label, a.x+6, a.y-8);
    }
    _leftMerge(c,f,t){
        const a=this._pt(f,'bottom'), b=this._pt(t,'top');
        c.beginPath(); c.moveTo(a.x,a.y); c.lineTo(a.x,b.y); c.lineTo(b.x,b.y); c.stroke();
        if(!(t.type==='process' && t.label==='')) this._arrow(c,b.x,b.y,'down');
    }
    _rightMerge(c,f,t){
        const a=this._pt(f,'bottom'), b=this._pt(t,'top');
        c.beginPath(); c.moveTo(a.x,a.y); c.lineTo(a.x,b.y); c.lineTo(b.x,b.y); c.stroke();
        if(!(t.type==='process' && t.label==='')) this._arrow(c,b.x,b.y,'down');
    }
    _noElseRight(c,f,t,label){
        const a=this._pt(f,'right'), b=this._pt(t,'top');
        const rx=a.x+50;
        c.beginPath(); c.moveTo(a.x,a.y); c.lineTo(rx,a.y); c.lineTo(rx,b.y); c.lineTo(b.x,b.y); c.stroke();
        if(!(t.type==='process' && t.label==='')) this._arrow(c,b.x,b.y,'down');
        if(label) c.fillText(label, a.x+6, a.y-8);
    }
    _back(c,f,t,label,farLeft,backDepth){
        const a=this._pt(f,'left'), b=this._pt(t,'left');
        const lx = farLeft + backDepth * 30;
        c.beginPath(); c.moveTo(a.x,a.y); c.lineTo(lx,a.y); c.lineTo(lx,b.y); c.lineTo(b.x,b.y); c.stroke();
        this._arrow(c,b.x,b.y,'right');
        if(label) c.fillText(label, a.x-18, a.y-8);
    }
    _rightExit(c,f,t,label,farRight,backDepth){
        const a=this._pt(f,'right'), b=this._pt(t,'top');
        const rx = farRight - backDepth * 30;
        c.beginPath(); c.moveTo(a.x,a.y); c.lineTo(rx,a.y); c.lineTo(rx,b.y); c.lineTo(b.x,b.y); c.stroke();
        if(!(t.type==='process' && t.label==='')) this._arrow(c,b.x,b.y,'down');
        if(label) c.fillText(label, a.x+6, a.y-8);
    }
    _chainRight(c,f,t,label){
        const a=this._pt(f,'right'), b=this._pt(t,'left');
        c.beginPath(); c.moveTo(a.x,a.y); c.lineTo(b.x,b.y); c.stroke();
        this._arrow(c,b.x,b.y,'right');
        if(label) c.fillText(label,a.x+6,a.y-8);
    }
    _chainExit(c,f,t){
        const a=this._pt(f,'right'), b=this._pt(t,'top');
        const rx = b.x;
        c.beginPath(); c.moveTo(a.x,a.y); c.lineTo(rx,a.y); c.lineTo(rx,b.y); c.stroke();
        if(!(t.type==='process' && t.label==='')) this._arrow(c,b.x,b.y,'down');
    }
    _breakExit(c,f,t,farLeft){
        const a=this._pt(f,'left'), b=this._pt(t,'top');
        const lx = farLeft - 10;
        c.beginPath(); c.moveTo(a.x,a.y); c.lineTo(lx,a.y); c.lineTo(lx,b.y); c.lineTo(b.x,b.y); c.stroke();
        if(!(t.type==='process' && t.label==='')) this._arrow(c,b.x,b.y,'down');
    }
    _arrow(c,x,y,dir){
        const s=7; c.save(); c.fillStyle='#000'; c.beginPath();
        if(dir==='down'){c.moveTo(x,y); c.lineTo(x-s/2,y-s); c.lineTo(x+s/2,y-s);}
        else if(dir==='right'){c.moveTo(x,y); c.lineTo(x-s,y-s/2); c.lineTo(x-s,y+s/2);}
        else if(dir==='up'){c.moveTo(x,y); c.lineTo(x-s/2,y+s); c.lineTo(x+s/2,y+s);}
        else if(dir==='left'){c.moveTo(x,y); c.lineTo(x+s,y-s/2); c.lineTo(x+s,y+s/2);}
        c.closePath(); c.fill(); c.restore();
    }
    _text(c,t,x,y,m){
        if(!t) return; const w=t.split(' '); const l=[]; let cur=w[0]||'';
        for(let i=1;i<w.length;i++){const tt=cur+' '+w[i]; if(c.measureText(tt).width>m&&cur){l.push(cur);cur=w[i];}else cur=tt;}
        l.push(cur); const lh=16, sy=y-(l.length-1)*lh/2; l.forEach((ll,i)=>c.fillText(ll,x,sy+i*lh));
    }
}
