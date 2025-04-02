import style from './Footer.module.css'

export default function Footer() {
    return (
      <footer className={style.footer}>
        <p>&copy; {new Date().getFullYear()} Comic World. All rights reserved.</p>
      </footer>
    );
  }