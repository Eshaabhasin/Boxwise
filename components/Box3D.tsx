/** A kraft carton in 3D, pure CSS (see .carton in globals.css): it turns slowly and its flaps open and close. */
export default function Box3D() {
  return (
    <div className="carton-scene" aria-hidden="true">
      <div className="carton-shadow" />
      <div className="carton">
        <div className="carton-face carton-front">
          <div className="carton-skin">
            <span className="carton-brand">Boxwise</span>
            <span className="carton-mark">↑ ↑ This side up</span>
          </div>
        </div>
        <div className="carton-face carton-back">
          <div className="carton-skin">
            <span className="carton-brand">Boxwise</span>
            <span className="carton-mark">Handle with care</span>
          </div>
        </div>
        <div className="carton-face carton-right">
          <div className="carton-skin carton-skin-side">
            <span className="carton-mark">3 ply · 5 ply · 7 ply</span>
          </div>
        </div>
        <div className="carton-face carton-left">
          <div className="carton-skin carton-skin-side">
            <span className="carton-mark">Say it. Quote it.</span>
          </div>
        </div>
        <div className="carton-face carton-bottom" />
        <div className="carton-flap carton-flap-right" />
        <div className="carton-flap carton-flap-left" />
        <div className="carton-flap carton-flap-front" />
        <div className="carton-flap carton-flap-back" />
        <div className="carton-tape" />
      </div>
    </div>
  );
}
